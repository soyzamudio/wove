import { and, desc, eq } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import { auditLog } from "../db/schema";
import { defineTool } from "./registry";
import { decodeCursor, encodeCursor } from "./shared";

export const auditList = defineTool({
  name: "audit.list",
  description: ToolDescriptions["audit.list"],
  input: ToolCatalog["audit.list"].input,
  output: ToolCatalog["audit.list"].output,
  scopes: ToolCatalog["audit.list"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const offset = decodeCursor(input.cursor);
    const rows = ctx.db.select().from(auditLog)
      .where(input.tool ? eq(auditLog.tool, input.tool) : undefined)
      .orderBy(desc(auditLog.ts), desc(auditLog.id))
      .limit(input.limit + 1).offset(offset).all();
    return {
      items: rows.slice(0, input.limit).map((r) => ({
        id: r.id, ts: r.ts, actorKind: r.actorKind, actorId: r.actorId ?? null,
        channel: r.channel, tool: r.tool, input: r.input, ok: r.ok, error: r.error ?? null,
      })),
      nextCursor: rows.length > input.limit ? encodeCursor(offset + input.limit) : null,
    };
  },
});

export const auditTools = [auditList];
