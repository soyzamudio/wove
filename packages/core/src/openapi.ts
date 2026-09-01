import { zodToJsonSchema } from "zod-to-json-schema";
import { MenuItem } from "@wove/sdk";
import type { Registry } from "./tools/registry";
import { LooseMenuItem } from "./tools/menus";
import { VERSION } from "./version";

/**
 * Self-referential schemas (`z.lazy`) cannot be inlined: with `$refStrategy: "none"`
 * zod-to-json-schema logs "Recursive reference detected … Defaulting to any" and emits
 * `{}` for the recursive branch, so `menu.set`'s nested `children` lost its type in
 * /api/tools, the OpenAPI document and MCP `tools/list` alike.
 *
 * Naming those schemas up front makes them proper `$ref` targets instead. Everything else
 * still inlines, so the common tool schema is unchanged.
 */
const RECURSIVE_DEFINITIONS = {
  /** The SDK contract (id required) — used by menu outputs. */
  MenuItem,
  /** The wire-input variant core accepts (id optional) — used by `menu.set` input. */
  MenuItemInput: LooseMenuItem,
};

const DEFINITIONS_KEY = "definitions";
const OPENAPI_DEFINITIONS_KEY = "components/schemas";

/**
 * `definitions` is emitted whole even when nothing references it, which would attach a
 * MenuItem block to all ~40 tool schemas. Drop the unreferenced ones (to a fixpoint, so a
 * definition kept alive only by another dropped definition goes too).
 */
function pruneDefinitions(root: Record<string, unknown>, key: string): void {
  const defs = root[key] as Record<string, unknown> | undefined;
  if (!defs) return;
  const refPath = key === DEFINITIONS_KEY ? DEFINITIONS_KEY : key;
  for (;;) {
    let dropped = false;
    for (const name of Object.keys(defs)) {
      const rest = { ...root, [key]: Object.fromEntries(Object.entries(defs).filter(([k]) => k !== name)) };
      if (!JSON.stringify(rest).includes(`"#/${refPath}/${name}"`)) {
        delete defs[name];
        dropped = true;
      }
    }
    if (!dropped) break;
  }
  if (Object.keys(defs).length === 0) delete root[key];
}

/**
 * Standalone JSON Schema for one zod schema: always an object schema at the top level
 * (MCP clients require `type: "object"`), with any recursive sub-schema carried inline
 * under `definitions`.
 */
export function jsonSchemaFor(schema: Parameters<typeof zodToJsonSchema>[0]) {
  const out = zodToJsonSchema(schema, {
    $refStrategy: "root",
    target: "openApi3",
    definitions: RECURSIVE_DEFINITIONS,
  }) as Record<string, unknown>;
  pruneDefinitions(out, DEFINITIONS_KEY);
  return out;
}

/**
 * Same, but with refs pointing at `#/components/schemas/...` so they resolve from the root
 * of the OpenAPI document. Definitions are returned separately for hoisting.
 */
function openApiSchemaFor(schema: Parameters<typeof zodToJsonSchema>[0]): {
  schema: Record<string, unknown>;
  definitions: Record<string, unknown>;
} {
  const out = zodToJsonSchema(schema, {
    $refStrategy: "root",
    target: "openApi3",
    definitionPath: OPENAPI_DEFINITIONS_KEY,
    definitions: RECURSIVE_DEFINITIONS,
  }) as Record<string, unknown>;
  pruneDefinitions(out, OPENAPI_DEFINITIONS_KEY);
  const definitions = (out[OPENAPI_DEFINITIONS_KEY] as Record<string, unknown>) ?? {};
  delete out[OPENAPI_DEFINITIONS_KEY];
  return { schema: out, definitions };
}

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string" },
    message: { type: "string" },
    details: {},
  },
  required: ["code", "message"],
};

const errorResponses = {
  "400": { description: "Validation error", content: { "application/json": { schema: ERROR_SCHEMA } } },
  "401": { description: "Unauthenticated", content: { "application/json": { schema: ERROR_SCHEMA } } },
  "403": { description: "Forbidden", content: { "application/json": { schema: ERROR_SCHEMA } } },
  "404": { description: "Not found", content: { "application/json": { schema: ERROR_SCHEMA } } },
  "429": { description: "Rate limited", content: { "application/json": { schema: ERROR_SCHEMA } } },
};

let cache: { reg: Registry; baseUrl: string; version: number; doc: Record<string, unknown> } | null = null;

/**
 * The document is pure function of (registry contents, baseUrl), and building it means
 * running zod-to-json-schema over every tool twice. Build it once per process and rebuild
 * only when a plugin registers a tool (`Registry.version` bumps on every `register`).
 */
export function buildOpenApi(reg: Registry, baseUrl = "http://localhost:4000") {
  if (cache && cache.reg === reg && cache.baseUrl === baseUrl && cache.version === reg.version) return cache.doc;
  const doc = renderOpenApi(reg, baseUrl);
  cache = { reg, baseUrl, version: reg.version, doc };
  return doc;
}

/** Test hook: forget the memoised document. */
export function resetOpenApiCache(): void {
  cache = null;
}

/** Hand-rolled OpenAPI 3.1 document derived from the tool registry. */
function renderOpenApi(reg: Registry, baseUrl: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {
    "/health": {
      get: {
        summary: "Liveness probe", tags: ["system"], security: [],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/tools": {
      get: {
        summary: "List all registered tools with their JSON schemas", tags: ["system"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/public/posts": {
      get: {
        summary: "Published posts (unauthenticated)", tags: ["public"], security: [],
        parameters: ["type", "term", "limit", "cursor"].map((name) => ({
          name, in: "query", required: false, schema: { type: "string" },
        })),
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/public/posts/{slug}": {
      get: {
        summary: "One published post by slug", tags: ["public"], security: [],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": errorResponses["404"] },
      },
    },
    "/api/public/settings": {
      get: { summary: "Public site settings", tags: ["public"], security: [], responses: { "200": { description: "OK" } } },
    },
    "/api/public/terms": {
      get: { summary: "Public taxonomy terms", tags: ["public"], security: [], responses: { "200": { description: "OK" } } },
    },
  };

  const sharedSchemas: Record<string, unknown> = {};

  for (const tool of reg.list()) {
    const input = openApiSchemaFor(tool.input);
    const output = openApiSchemaFor(tool.output);
    Object.assign(sharedSchemas, input.definitions, output.definitions);
    paths[`/api/tools/${tool.name}`] = {
      post: {
        operationId: tool.name.replace(/\./g, "_"),
        summary: tool.description,
        tags: [tool.name.split(".")[0]],
        "x-scopes": tool.scopes,
        requestBody: {
          required: true,
          content: { "application/json": { schema: input.schema } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: output.schema } } },
          ...errorResponses,
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "wove core",
      version: VERSION,
      description: "Every admin action is a typed tool, exposed identically over REST and MCP.",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        agentKey: { type: "http", scheme: "bearer", description: "Agent API key (`wove_...`)" },
        session: { type: "apiKey", in: "cookie", name: "wove_session" },
      },
      schemas: { Error: ERROR_SCHEMA, ...sharedSchemas },
    },
    security: [{ agentKey: [] }, { session: [] }],
    paths,
  };
}
