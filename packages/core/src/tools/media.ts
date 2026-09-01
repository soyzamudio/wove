import { desc, eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import { media } from "../db/schema";
import { newId, nowIso } from "../ids";
import { defineTool, badRequest, notFound } from "./registry";
import { decodeCursor, encodeCursor } from "./shared";

export function mediaDir(): string {
  return process.env.AGENTPRESS_MEDIA_DIR ?? join(process.cwd(), "data", "media");
}

/** Strip anything that could escape the media dir or confuse a URL. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(0, 120);
  return cleaned || "file";
}

const toMedia = (r: typeof media.$inferSelect) => ({
  id: r.id, path: r.path, url: r.url, mime: r.mime, size: r.size,
  alt: r.alt ?? null, width: r.width ?? null, height: r.height ?? null, createdAt: r.createdAt,
});

export const mediaList = defineTool({
  name: "media.list",
  description: ToolDescriptions["media.list"],
  input: ToolCatalog["media.list"].input,
  output: ToolCatalog["media.list"].output,
  scopes: ToolCatalog["media.list"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const offset = decodeCursor(input.cursor);
    const rows = ctx.db.select().from(media)
      .orderBy(desc(media.createdAt), desc(media.id))
      .limit(input.limit + 1).offset(offset).all();
    return {
      items: rows.slice(0, input.limit).map(toMedia),
      nextCursor: rows.length > input.limit ? encodeCursor(offset + input.limit) : null,
    };
  },
});

export const mediaUpload = defineTool({
  name: "media.upload",
  description: ToolDescriptions["media.upload"],
  input: ToolCatalog["media.upload"].input,
  output: ToolCatalog["media.upload"].output,
  scopes: ToolCatalog["media.upload"].scopes,
  handler: async (ctx, input) => {
    let bytes: Uint8Array;
    try {
      const b64 = input.base64.replace(/^data:[^;]+;base64,/, "");
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      throw badRequest("`base64` is not valid base64 data");
    }
    const id = newId();
    const file = `${id}-${safeFilename(input.filename)}`;
    const path = join(mediaDir(), file);
    await Bun.write(path, bytes);

    const row = {
      id, path, url: `/media/${file}`, mime: input.mime, size: bytes.byteLength,
      alt: input.alt ?? null,
      // TODO: image dimension probing is out of scope for v1; nullable per the SDK schema.
      width: null, height: null,
      createdAt: nowIso(),
    };
    ctx.db.insert(media).values(row).run();
    const item = toMedia(row as typeof media.$inferSelect);
    await ctx.hooks.emit("media.afterUpload", { media: item, ctx: { actor: ctx.actor, channel: ctx.channel } });
    return item;
  },
});

export const mediaDelete = defineTool({
  name: "media.delete",
  description: ToolDescriptions["media.delete"],
  input: ToolCatalog["media.delete"].input,
  output: ToolCatalog["media.delete"].output,
  scopes: ToolCatalog["media.delete"].scopes,
  handler: async (ctx, input) => {
    const row = ctx.db.select().from(media).where(eq(media.id, input.id)).get();
    if (!row) throw notFound(`No media with id "${input.id}"`);
    ctx.db.delete(media).where(eq(media.id, input.id)).run();
    await unlink(row.path).catch(() => {});
    return { ok: true as const };
  },
});

export const mediaTools = [mediaList, mediaUpload, mediaDelete];
