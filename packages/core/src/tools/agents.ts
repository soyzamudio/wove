import { asc, eq, isNull } from "drizzle-orm";
import type { Scope } from "@wove/sdk";
import { ToolCatalog, ToolDescriptions } from "@wove/sdk";
import { agents } from "../db/schema";
import { newApiKey, newId, nowIso, sha256 } from "../ids";
import { defineTool, notFound, ToolError } from "./registry";

const toAgent = (r: typeof agents.$inferSelect) => ({
  id: r.id, name: r.name, scopes: r.scopes as Scope[], createdBy: r.createdBy,
  createdAt: r.createdAt, lastUsedAt: r.lastUsedAt ?? null,
});

export const agentList = defineTool({
  name: "agent.list",
  description: ToolDescriptions["agent.list"],
  input: ToolCatalog["agent.list"].input,
  output: ToolCatalog["agent.list"].output,
  scopes: ToolCatalog["agent.list"].scopes,
  mutation: false,
  handler: (ctx) =>
    ctx.db.select().from(agents).where(isNull(agents.revokedAt)).orderBy(asc(agents.createdAt)).all().map(toAgent),
});

export const agentCreate = defineTool({
  name: "agent.create",
  description: ToolDescriptions["agent.create"],
  input: ToolCatalog["agent.create"].input,
  output: ToolCatalog["agent.create"].output,
  scopes: ToolCatalog["agent.create"].scopes,
  handler: (ctx, input) => {
    // An agent can never be created with more power than its creator.
    if (!ctx.actor.scopes.includes("*")) {
      const over = input.scopes.filter((s) => s === "*" || !ctx.actor.scopes.includes(s));
      if (over.length) throw new ToolError("forbidden", `Cannot grant scopes you do not hold: ${over.join(", ")}`);
    }
    const apiKey = newApiKey();
    const row = {
      id: newId(),
      name: input.name,
      keyHash: sha256(apiKey),
      scopes: input.scopes as string[],
      createdBy: ctx.actor.id ?? "system",
      createdAt: nowIso(),
      lastUsedAt: null,
      revokedAt: null,
    };
    ctx.db.insert(agents).values(row).run();
    return { ...toAgent(row as typeof agents.$inferSelect), apiKey };
  },
});

export const agentRevoke = defineTool({
  name: "agent.revoke",
  description: ToolDescriptions["agent.revoke"],
  input: ToolCatalog["agent.revoke"].input,
  output: ToolCatalog["agent.revoke"].output,
  scopes: ToolCatalog["agent.revoke"].scopes,
  handler: (ctx, input) => {
    const row = ctx.db.select().from(agents).where(eq(agents.id, input.id)).get();
    if (!row || row.revokedAt) throw notFound(`No active agent with id "${input.id}"`);
    // Blank the hash so the key can never authenticate again, even if the row is restored.
    ctx.db.update(agents)
      .set({ revokedAt: nowIso(), keyHash: `revoked:${row.id}` })
      .where(eq(agents.id, input.id))
      .run();
    return { ok: true as const };
  },
});

export const agentTools = [agentList, agentCreate, agentRevoke];
