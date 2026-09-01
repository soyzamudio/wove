import { desc, eq, ne, sql } from "drizzle-orm";
import { SiteExport, ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import type { DB } from "../db";
import { media, postTerms, posts, terms as termsTable } from "../db/schema";
import { nowIso } from "../ids";
import { defineTool } from "./registry";
import { readDesign } from "./design";
import { readMenus } from "./menus";
import { hydratePosts, readSettings } from "./shared";

/**
 * The whole site as one JSON document: settings, design, menus, terms, the media list and
 * every post except the trash (blocks pages come back with their parsed `blocks`).
 */
export function buildSiteExport(db: DB): SiteExport {
  const termRows = db
    .select({
      id: termsTable.id, taxonomy: termsTable.taxonomy, slug: termsTable.slug,
      name: termsTable.name, count: sql<number>`count(${postTerms.postId})`.as("count"),
    })
    .from(termsTable)
    .leftJoin(postTerms, eq(postTerms.termId, termsTable.id))
    .groupBy(termsTable.id)
    .orderBy(termsTable.taxonomy, termsTable.name)
    .all();

  const mediaRows = db.select().from(media).orderBy(desc(media.createdAt), desc(media.id)).all();
  const postRows = db.select().from(posts).where(ne(posts.status, "trashed"))
    .orderBy(desc(posts.createdAt), desc(posts.id)).all();

  return SiteExport.parse({
    version: 1,
    exportedAt: nowIso(),
    settings: readSettings(db),
    design: readDesign(db),
    menus: readMenus(db),
    terms: termRows.map((r) => ({ ...r, count: Number(r.count) })),
    media: mediaRows.map((r) => ({
      id: r.id, path: r.path, url: r.url, mime: r.mime, size: r.size,
      alt: r.alt ?? null, width: r.width ?? null, height: r.height ?? null,
      variants: r.variants ?? [], createdAt: r.createdAt,
    })),
    posts: hydratePosts(db, postRows),
  });
}

export const exportSite = defineTool({
  name: "export.site",
  description: ToolDescriptions["export.site"],
  input: ToolCatalog["export.site"].input,
  output: ToolCatalog["export.site"].output,
  scopes: ToolCatalog["export.site"].scopes,
  mutation: false,
  handler: (ctx) => buildSiteExport(ctx.db),
});

export const exportTools = [exportSite];
