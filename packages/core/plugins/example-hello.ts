import { z } from "zod";
import { definePlugin } from "../src/plugins";
import { defineTool } from "../src/tools/registry";

/**
 * Example plugin. Proves that a plugin-registered tool automatically shows up in
 * `GET /api/tools`, `POST /api/tools/:name`, the OpenAPI document and MCP `tools/list`.
 */
export default definePlugin({
  name: "example-hello",
  tools: [
    defineTool({
      name: "hello.ping",
      description: "Example plugin tool: echoes a greeting back with the calling actor.",
      input: z.object({ name: z.string().default("world") }),
      output: z.object({ message: z.string(), actor: z.string(), channel: z.string() }),
      scopes: ["content:read"],
      mutation: false,
      handler: (ctx, input) => ({
        message: `hello, ${input.name}`,
        actor: `${ctx.actor.kind}:${ctx.actor.id ?? "-"}`,
        channel: ctx.channel,
      }),
    }),
  ],
  hooks: {
    "post.afterSave": ({ post, created }) => {
      console.log(`[example-hello] post ${created ? "created" : "updated"}: ${post.slug}`);
    },
  },
});
