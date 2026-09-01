import { zodToJsonSchema } from "zod-to-json-schema";
import type { Registry } from "./tools/registry";
import { VERSION } from "./version";

export function jsonSchemaFor(schema: Parameters<typeof zodToJsonSchema>[0]) {
  return zodToJsonSchema(schema, { $refStrategy: "none", target: "openApi3" }) as Record<string, unknown>;
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
};

/** Hand-rolled OpenAPI 3.1 document derived from the tool registry. */
export function buildOpenApi(reg: Registry, baseUrl = "http://localhost:4000") {
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

  for (const tool of reg.list()) {
    paths[`/api/tools/${tool.name}`] = {
      post: {
        operationId: tool.name.replace(/\./g, "_"),
        summary: tool.description,
        tags: [tool.name.split(".")[0]],
        "x-scopes": tool.scopes,
        requestBody: {
          required: true,
          content: { "application/json": { schema: jsonSchemaFor(tool.input) } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: jsonSchemaFor(tool.output) } } },
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
      schemas: { Error: ERROR_SCHEMA },
    },
    security: [{ agentKey: [] }, { session: [] }],
    paths,
  };
}
