import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { agents } from "./db/schema";
import { registerPlugin } from "./plugins";
import { ADMIN, makeHarness, unwrap } from "./test-helpers";
import { defineTool } from "./tools/registry";
import { z } from "zod";
import { createUser } from "./auth";

const h = makeHarness();
const req = (path: string, init?: RequestInit) => h.app.fetch(new Request(`http://localhost:4000${path}`, init));
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  req(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("http + auth + plugins", () => {
  test("agent API key authenticates and carries its scopes", async () => {
    const admin = await createUser(h.db, { email: "a@example.com", name: "A", password: "password123", role: "admin" });
    const created = unwrap(
      await h.call({ kind: "user", id: admin.id, scopes: ["*"] }, "agent.create", { name: "writer", scopes: ["content:read", "content:write"] }),
    );
    expect(created.apiKey).toMatch(/^ap_/);

    const auth = { authorization: `Bearer ${created.apiKey}` };
    const me = await req("/api/auth/me", { headers: auth });
    expect(me.status).toBe(200);
    expect((await me.json()).actor).toMatchObject({ kind: "agent", id: created.id });

    // the plaintext key is never stored
    const row = h.db.select().from(agents).where(eq(agents.id, created.id)).get()!;
    expect(row.keyHash).not.toBe(created.apiKey);
    expect(row.lastUsedAt).toBeTruthy();

    // it can write...
    const ok = await post("/api/tools/post.create", { title: "By agent" }, auth);
    expect(ok.status).toBe(200);
    // ...but not manage agents
    const denied = await post("/api/tools/agent.list", {}, auth);
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("forbidden");

    // a bogus key is anon -> 401
    expect((await post("/api/tools/post.list", {}, { authorization: "Bearer ap_bogus" })).status).toBe(401);
  });

  test("login sets a session cookie usable for tool calls", async () => {
    await createUser(h.db, { email: "ed@example.com", name: "Ed", password: "password123", role: "editor" });
    const bad = await post("/api/auth/login", { email: "ed@example.com", password: "wrong" });
    expect(bad.status).toBe(401);

    const res = await post("/api/auth/login", { email: "ed@example.com", password: "password123" });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    expect(cookie).toStartWith("ap_session=");

    const listed = await post("/api/tools/post.list", {}, { cookie });
    expect(listed.status).toBe(200);

    await post("/api/auth/logout", {}, { cookie });
    expect((await req("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  test("setup only works while there are zero users", async () => {
    const res = await post("/api/auth/setup", { email: "x@example.com", name: "X", password: "password123" });
    expect(res.status).toBe(409); // users already exist from the tests above
  });

  test("public posts hide drafts and not-yet-due scheduled posts", async () => {
    const pub = unwrap(await h.call(ADMIN, "post.create", { title: "Public one", status: "published" }));
    unwrap(await h.call(ADMIN, "post.create", { title: "Secret draft" }));
    const sched = unwrap(await h.call(ADMIN, "post.create", { title: "Future thing" }));
    unwrap(await h.call(ADMIN, "post.publish", { id: sched.id, at: new Date(Date.now() + 86_400_000).toISOString() }));

    const body = await (await req("/api/public/posts")).json();
    const slugs = body.items.map((p: any) => p.slug);
    expect(slugs).toContain(pub.slug);
    expect(slugs).not.toContain("secret-draft");
    expect(slugs).not.toContain("future-thing");

    expect((await req("/api/public/posts/secret-draft")).status).toBe(404);
    expect((await req(`/api/public/posts/${pub.slug}`)).status).toBe(200);
    expect((await req("/api/public/settings")).status).toBe(200);
    expect((await req("/api/public/terms")).status).toBe(200);
  });

  test("public reads never surface trashed posts", async () => {
    const p = unwrap(await h.call(ADMIN, "post.create", { title: "Trashed publicly", status: "published" }));
    expect((await req(`/api/public/posts/${p.slug}`)).status).toBe(200);

    unwrap(await h.call(ADMIN, "post.delete", { id: p.id }));
    const body = await (await req("/api/public/posts")).json();
    expect(body.items.map((x: any) => x.slug)).not.toContain(p.slug);
    expect((await req(`/api/public/posts/${p.slug}`)).status).toBe(404);
    expect((await (await req("/api/public/search?q=Trashed")).json()).items).toEqual([]);
  });

  test("public search ranks title matches first and hides unpublished content", async () => {
    unwrap(await h.call(ADMIN, "post.create", {
      title: "Agentics in the body", status: "published", content: "nothing to see",
    }));
    unwrap(await h.call(ADMIN, "post.create", {
      title: "Body mentions the word", status: "published", content: "an agentics deep dive",
    }));
    unwrap(await h.call(ADMIN, "post.create", { title: "Agentics draft", content: "agentics" }));

    const hits = await (await req("/api/public/search?q=agentics")).json();
    const slugs = hits.items.map((p: any) => p.slug);
    expect(slugs[0]).toBe("agentics-in-the-body"); // title match wins
    expect(slugs).toContain("body-mentions-the-word");
    expect(slugs).not.toContain("agentics-draft");

    // case-insensitive, and posts carry the new fields
    expect((await (await req("/api/public/search?q=AGENTICS")).json()).items.length).toBe(slugs.length);
    expect(hits.items[0]).toHaveProperty("featuredImage");
    expect(hits.items[0].seo).toMatchObject({ noindex: false });

    // too short, and the limit is capped at 50
    expect((await (await req("/api/public/search?q=a")).json()).items).toEqual([]);
    expect((await (await req("/api/public/search?q=agentics&limit=999")).json()).items.length).toBeLessThanOrEqual(50);
  });

  test("public menus and design are readable without auth", async () => {
    unwrap(await h.call(ADMIN, "menu.set", { location: "header", name: "Header", items: [{ id: "h", label: "Home", href: "/" }] }));
    unwrap(await h.call(ADMIN, "design.update", { radius: 8 }));
    const menus = await (await req("/api/public/menus")).json();
    expect(menus[0]).toMatchObject({ location: "header", name: "Header" });
    expect((await (await req("/api/public/design")).json()).radius).toBe(8);
  });

  test("plugin tools appear in the registry, REST and /api/tools", async () => {
    registerPlugin(
      {
        name: "test-plugin",
        tools: [
          defineTool({
            name: "hello.ping",
            description: "test",
            input: z.object({ name: z.string().default("world") }),
            output: z.object({ message: z.string() }),
            scopes: ["content:read"],
            mutation: false,
            handler: (_ctx, i) => ({ message: `hello, ${i.name}` }),
          }),
        ],
      },
      h.registry,
      h.hooks,
    );
    expect(h.registry.has("hello.ping")).toBe(true);
    expect(unwrap(await h.call(ADMIN, "hello.ping", { name: "bun" })).message).toBe("hello, bun");

    const listed = await (await req("/api/tools")).json();
    expect(listed.tools.map((t: any) => t.name)).toContain("hello.ping");
    const spec = await (await req("/api/openapi.json")).json();
    expect(spec.paths["/api/tools/hello.ping"]).toBeTruthy();
  });

  test("health reports version and tool count", async () => {
    const body = await (await req("/health")).json();
    expect(body.ok).toBe(true);
    expect(body.tools).toBeGreaterThan(15);
  });

  test("MCP tools/list and tools/call over /mcp", async () => {
    const user = await createUser(h.db, { email: "mcp@example.com", name: "M", password: "password123", role: "admin" });
    const key = unwrap(
      await h.call({ kind: "user", id: user.id, scopes: ["*"] }, "agent.create", { name: "mcp-agent", scopes: ["*"] }),
    ).apiKey;
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${key}`,
    };
    const rpc = (body: unknown) => req("/mcp", { method: "POST", headers, body: JSON.stringify(body) });

    const init = await rpc({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    expect(init.status).toBe(200);

    const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })).json();
    const names = list.result.tools.map((t: any) => t.name);
    expect(names).toContain("post.create");
    expect(names).toContain("hello.ping");

    const called = await (await rpc({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "post.create", arguments: { title: "Made over MCP" } },
    })).json();
    const payload = JSON.parse(called.result.content[0].text);
    expect(payload.slug).toBe("made-over-mcp");
  });
});
