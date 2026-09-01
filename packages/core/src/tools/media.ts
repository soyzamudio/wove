import { desc, eq } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import { media } from "../db/schema";
import { newId, nowIso } from "../ids";
import { processImage } from "../images";
import { storage } from "../storage";
import { defineTool, badRequest, notFound, type Ctx } from "./registry";
import { decodeCursor, encodeCursor } from "./shared";

export { mediaDir } from "../storage";

const DEFAULT_MAX_UPLOAD_MB = 25;

export function maxUploadBytes(): number {
  const mb = Number(process.env.AGENTPRESS_MAX_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
}

/** Byte length a base64 payload will decode to, without decoding it. */
export function estimateBase64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (b64.endsWith("==")) padding = 2;
  else if (b64.endsWith("=")) padding = 1;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

/** Strip anything that could escape the media dir or confuse a URL. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(0, 120);
  return cleaned || "file";
}

/** Storage key for a variant rendition of `key` at `width`. */
export const variantKey = (key: string, width: number) => `${key}.w${width}.webp`;

const toMedia = (r: typeof media.$inferSelect) => ({
  id: r.id, path: r.path, url: r.url, mime: r.mime, size: r.size,
  alt: r.alt ?? null, width: r.width ?? null, height: r.height ?? null,
  variants: r.variants ?? [], createdAt: r.createdAt,
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

export interface StoreMediaInput {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  alt?: string | null;
}

/**
 * The one path media takes into the library: store the original, render webp variants,
 * insert the row, fire `media.afterUpload`. Shared by `media.upload` and the WordPress
 * importer so both produce identical rows.
 */
export async function storeMedia(ctx: Ctx, input: StoreMediaInput) {
  const store = storage();
  const id = newId();
  const key = `${id}-${safeFilename(input.filename)}`;
  const { url } = await store.put(key, input.bytes, input.mime);

  const { width, height, variants: renditions } = await processImage(input.bytes, input.mime);
  const variants: Array<{ width: number; url: string; format?: string }> = [];
  for (const r of renditions) {
    const vKey = variantKey(key, r.width);
    const put = await store.put(vKey, r.bytes, "image/webp");
    variants.push({ width: r.width, url: put.url, format: "webp" });
  }

  const row = {
    id, path: key, url, mime: input.mime, size: input.bytes.byteLength,
    alt: input.alt ?? null, width, height, variants,
    createdAt: nowIso(),
  };
  ctx.db.insert(media).values(row).run();
  const item = toMedia(row as typeof media.$inferSelect);
  await ctx.hooks.emit("media.afterUpload", { media: item, ctx: { actor: ctx.actor, channel: ctx.channel } });
  return item;
}

export const mediaUpload = defineTool({
  name: "media.upload",
  description: ToolDescriptions["media.upload"],
  input: ToolCatalog["media.upload"].input,
  output: ToolCatalog["media.upload"].output,
  scopes: ToolCatalog["media.upload"].scopes,
  handler: async (ctx, input) => {
    const b64 = input.base64.replace(/^data:[^;]+;base64,/, "");
    const cap = maxUploadBytes();
    if (estimateBase64Bytes(b64) > cap) {
      throw badRequest(`File exceeds the ${Math.round(cap / (1024 * 1024))} MB upload limit`);
    }
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      throw badRequest("`base64` is not valid base64 data");
    }
    if (bytes.byteLength > cap) {
      throw badRequest(`File exceeds the ${Math.round(cap / (1024 * 1024))} MB upload limit`);
    }

    return storeMedia(ctx, { bytes, filename: input.filename, mime: input.mime, alt: input.alt ?? null });
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
    const store = storage();
    const key = storageKeyOf(row.path);
    await store.delete(key);
    for (const v of row.variants ?? []) await store.delete(variantKey(key, v.width));
    return { ok: true as const };
  },
});

/**
 * Rows written before the storage driver landed hold an absolute filesystem path;
 * newer rows hold the storage key. Accept both.
 */
function storageKeyOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export const mediaTools = [mediaList, mediaUpload, mediaDelete];
