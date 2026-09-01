import { eq, sql } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import { postTerms, terms as termsTable } from "../db/schema";
import { defineTool } from "./registry";

export const termList = defineTool({
  name: "term.list",
  description: ToolDescriptions["term.list"],
  input: ToolCatalog["term.list"].input,
  output: ToolCatalog["term.list"].output,
  scopes: ToolCatalog["term.list"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const q = ctx.db
      .select({
        id: termsTable.id,
        taxonomy: termsTable.taxonomy,
        slug: termsTable.slug,
        name: termsTable.name,
        count: sql<number>`count(${postTerms.postId})`.as("count"),
      })
      .from(termsTable)
      .leftJoin(postTerms, eq(postTerms.termId, termsTable.id))
      .groupBy(termsTable.id)
      .orderBy(termsTable.taxonomy, termsTable.name);
    const rows = input.taxonomy ? q.where(eq(termsTable.taxonomy, input.taxonomy)).all() : q.all();
    return rows.map((r) => ({ ...r, count: Number(r.count) }));
  },
});

export const taxonomyTools = [termList];
