import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { MenuItem } from "@wove/sdk";
import { buildOpenApi, jsonSchemaFor, resetOpenApiCache } from "./openapi";
import { defineTool } from "./tools/registry";
import { ADMIN, makeHarness } from "./test-helpers";
import { createUser } from "./auth";
import { registerPlugin } from "./plugins";

const h = makeHarness();
const req = (path: string, init?: RequestInit) => h.app.fetch(new Request(`http://localhost:4000${path}`, init));

describe("recursive schemas", () => {
  test("MenuItem becomes a $ref instead of `any`", () => {
    const schema = jsonSchemaFor(z.object({ items: z.array(MenuItem) })) as any;
    expect(schema.type).toBe("object");
    expect(schema.properties.items.items.$ref).toBe("#/definitions/MenuItem");
    const def = schema.definitions.MenuItem;
    expect(def.type).toBe("object");
    // the recursive branch is typed, not `{}`
    expect(def.properties.children.items.$ref).toBe("#/definitions/MenuItem");
    expect(def.properties.children.items).not.toEqual({});
  });

  test("schemas that do not use it carry no definitions block", () => {
    expect(jsonSchemaFor(z.object({ a: z.string() }))).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    });
  });

  test("/api/tools exposes a valid object schema for menu.set with a typed children branch", async () => {
    const tools = (await (await req("/api/tools")).json()).tools as any[];
    const menuSet = tools.find((t) => t.name === "menu.set")!;
    expect(menuSet.inputSchema.type).toBe("object");
    const ref = menuSet.inputSchema.properties.items.items.$ref as string;
    expect(ref).toStartWith("#/definitions/");
    const def = menuSet.inputSchema.definitions[ref.split("/").pop()!];
    expect(def.type).toBe("object");
    expect(def.properties.children.items.$ref).toBe(ref);
    // no tool schema anywhere still contains an untyped recursive placeholder
    expect(JSON.stringify(tools)).not.toContain('"items":{}');
  });

  test("the OpenAPI document resolves its refs against components/schemas", async () => {
    const spec = (await (await req("/api/openapi.json")).json()) as any;
    const input = spec.paths["/api/tools/menu.set"].post.requestBody.content["application/json"].schema;
    expect(input.type).toBe("object");
    const ref = input.properties.items.items.$ref as string;
    expect(ref).toStartWith("#/components/schemas/");
    const name = ref.split("/").pop()!;
    expect(spec.components.schemas[name]).toBeTruthy();
    expect(spec.components.schemas[name].properties.children.items.$ref).toBe(ref);
    // nothing dangles: every $ref in the document has a target
    for (const m of JSON.stringify(spec).matchAll(/"#\/components\/schemas\/([A-Za-z0-9_]+)"/g)) {
      expect(spec.components.schemas[m[1]!]).toBeTruthy();
    }
  });

  test("MCP tools/list still returns object schemas", async () => {
    const user = await createUser(h.db, { email: "schema@example.com", name: "S", password: "password123", role: "admin" });
    const key = (await h.call({ kind: "user", id: user.id, scopes: ["*"] }, "agent.create", { name: "schema-agent", scopes: ["*"] }) as any).data.apiKey;
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${key}`,
    };
    await req("/mcp", {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }),
    });
    const list = await (await req("/mcp", {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    })).json();
    const tools = list.result.tools as any[];
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
    const menuSet = tools.find((t) => t.name === "menu.set")!;
    expect(menuSet.inputSchema.definitions).toBeTruthy();
    expect(menuSet.inputSchema.properties.items.items.$ref).toStartWith("#/definitions/");
  });
});

describe("OpenAPI caching", () => {
  test("the document is built once and rebuilt when a plugin registers", () => {
    resetOpenApiCache();
    const first = buildOpenApi(h.registry);
    expect(buildOpenApi(h.registry)).toBe(first); // same object: no rebuild

    registerPlugin(
      {
        name: "openapi-cache-test",
        tools: [
          defineTool({
            name: "cache.ping", description: "test", input: z.object({}), output: z.object({ ok: z.boolean() }),
            scopes: [], mutation: false, handler: () => ({ ok: true }),
          }),
        ],
      },
      h.registry,
      h.hooks,
    );

    const second = buildOpenApi(h.registry);
    expect(second).not.toBe(first);
    expect((second as any).paths["/api/tools/cache.ping"]).toBeTruthy();
    // and a different baseUrl is not served from the cache either
    expect(buildOpenApi(h.registry, "https://other.example")).not.toBe(second);
  });

  test("ADMIN is still able to call tools after all that", async () => {
    expect((await h.call(ADMIN, "menu.list", {})).ok).toBe(true);
  });
});
