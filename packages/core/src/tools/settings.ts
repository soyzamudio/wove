import { count, eq } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions } from "@wove/sdk";
import { media, posts } from "../db/schema";
import { defineTool } from "./registry";
import { readSettings, writeSettings } from "./shared";
import { VERSION } from "../version";
import { cachedUpdate, installHint } from "../updates";

export const settingsGet = defineTool({
  name: "settings.get",
  description: ToolDescriptions["settings.get"],
  input: ToolCatalog["settings.get"].input,
  output: ToolCatalog["settings.get"].output,
  scopes: ToolCatalog["settings.get"].scopes,
  mutation: false,
  handler: (ctx) => readSettings(ctx.db),
});

export const settingsUpdate = defineTool({
  name: "settings.update",
  description: ToolDescriptions["settings.update"],
  input: ToolCatalog["settings.update"].input,
  output: ToolCatalog["settings.update"].output,
  scopes: ToolCatalog["settings.update"].scopes,
  handler: (ctx, input) => writeSettings(ctx.db, input as Record<string, unknown>),
});

/** The daily update check's cached result, shaped for `site.info`. Null when there is none. */
function updateBanner(): { latest: string; url: string; installHint: string } | null {
  const u = cachedUpdate();
  if (!u) return null;
  return { latest: u.latest, url: u.url, installHint: installHint() };
}

export const siteInfo = defineTool({
  name: "site.info",
  description: ToolDescriptions["site.info"],
  input: ToolCatalog["site.info"].input,
  output: ToolCatalog["site.info"].output,
  scopes: ToolCatalog["site.info"].scopes,
  mutation: false,
  handler: (ctx) => {
    const n = (type: "post" | "page") =>
      Number(ctx.db.select({ c: count() }).from(posts).where(eq(posts.type, type)).get()?.c ?? 0);
    return {
      settings: readSettings(ctx.db),
      counts: {
        posts: n("post"),
        pages: n("page"),
        media: Number(ctx.db.select({ c: count() }).from(media).get()?.c ?? 0),
      },
      version: VERSION,
      update: updateBanner(),
    };
  },
});

export const settingsTools = [settingsGet, settingsUpdate, siteInfo];
