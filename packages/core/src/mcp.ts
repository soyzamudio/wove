import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Actor } from "@agentpress/sdk";
import type { DB } from "./db";
import type { Hooks } from "./hooks";
import { dispatch, type Registry } from "./tools/registry";
import { jsonSchemaFor } from "./openapi";
import { VERSION } from "./version";

export interface McpDeps {
  db: DB;
  hooks: Hooks;
  registry: Registry;
  resolve: (req: Request) => Actor;
}

/**
 * Streamable HTTP MCP endpoint. A fresh Server + transport is built per request
 * (stateless mode) so each call carries the Actor resolved from that request's
 * `Authorization: Bearer ap_...` header. Channel is always `mcp`.
 */
export function createMcpHandler(deps: McpDeps) {
  return async function handleMcp(req: Request): Promise<Response> {
    const actor = deps.resolve(req);

    const server = new Server(
      { name: "agentpress", version: VERSION },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: deps.registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: jsonSchemaFor(t.input) as { type: "object" },
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const result = await dispatch(
        request.params.name,
        request.params.arguments ?? {},
        { actor, channel: "mcp", db: deps.db, hooks: deps.hooks },
        deps.registry,
      );
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify(result.error, null, 2) }],
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
      };
    });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      // stateless: tear the pair down once the response is produced
      queueMicrotask(() => { void server.close().catch(() => {}); });
    }
  };
}
