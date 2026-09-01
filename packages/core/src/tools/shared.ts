import { and, eq, inArray } from "drizzle-orm";
import type { BlocksDoc, ImageRef, Post } from "@agentpress/sdk";
import { parseBlocksDoc, Post as PostSchema } from "@agentpress/sdk";
import type { DB } from "../db";
import { posts, postTerms, terms as termsTable, settings as settingsTable } from "../db/schema";
import type { PostRow } from "../db/schema";
import { Settings } from "@agentpress/sdk";
import { newId, nowIso, slugify } from "../ids";

/** Opaque offset cursor. Simple and stable enough for v1; swap for keyset when lists get big. */
export const encodeCursor = (offset: number): string => btoa(String(offset));
export const decodeCursor = (c: string | undefined): number => {
  if (!c) return 0;
  const n = Number(atob(c));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export type PostTermRef = { taxonomy: string; slug: string; name: string };

export function termsForPosts(db: DB, postIds: string[]): Map<string, PostTermRef[]> {
  const map = new Map<string, PostTermRef[]>();
  if (postIds.length === 0) return map;
  const rows = db
    .select({
      postId: postTerms.postId,
      taxonomy: termsTable.taxonomy,
      slug: termsTable.slug,
      name: termsTable.name,
    })
    .from(postTerms)
    .innerJoin(termsTable, eq(postTerms.termId, termsTable.id))
    .where(inArray(postTerms.postId, postIds))
    .all();
  for (const r of rows) {
    const list = map.get(r.postId) ?? [];
    list.push({ taxonomy: r.taxonomy, slug: r.slug, name: r.name });
    map.set(r.postId, list);
  }
  return map;
}

/**
 * Reads must never fail on a bad blocks payload: a page whose JSON drifted still renders
 * (as an empty document) instead of 500-ing the whole list it appears in.
 */
export function safeBlocks(row: { id: string; content: string }): BlocksDoc {
  try {
    return parseBlocksDoc(row.content);
  } catch (e) {
    console.warn(`[blocks] post ${row.id} has an invalid blocks document; serving an empty one:`, (e as Error)?.message);
    return { version: 1, blocks: [] };
  }
}

/** `featuredImage` and `seo` are stored as loose JSON; reads normalise them through the SDK schema. */
const featuredImageSchema = PostSchema.shape.featuredImage;
const seoSchema = PostSchema.shape.seo;

export function parseFeaturedImage(value: unknown): ImageRef | null {
  if (value == null) return null;
  const parsed = featuredImageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseSeo(value: unknown): Post["seo"] {
  const parsed = seoSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : seoSchema.parse({});
}

export function toPost(row: PostRow, refs: PostTermRef[] = []): Post {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    content: row.content,
    format: row.format,
    blocks: row.format === "blocks" ? safeBlocks(row) : null,
    excerpt: row.excerpt ?? null,
    featuredImage: parseFeaturedImage(row.featuredImage),
    seo: parseSeo(row.seo),
    status: row.status,
    authorId: row.authorId ?? null,
    publishedAt: row.publishedAt ?? null,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    terms: refs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function hydratePost(db: DB, row: PostRow): Post {
  return toPost(row, termsForPosts(db, [row.id]).get(row.id) ?? []);
}

export function hydratePosts(db: DB, rows: PostRow[]): Post[] {
  const map = termsForPosts(db, rows.map((r) => r.id));
  return rows.map((r) => toPost(r, map.get(r.id) ?? []));
}

/** Derive a unique slug, de-duping with `-2`, `-3`, ... */
export function uniqueSlug(db: DB, base: string, excludeId?: string): string {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
  for (;;) {
    const existing = db.select({ id: posts.id }).from(posts).where(eq(posts.slug, candidate)).get();
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

/** Upsert a term by (taxonomy, slugify(name)) and return its id. */
export function upsertTerm(db: DB, taxonomy: string, name: string): string {
  const slug = slugify(name);
  const existing = db
    .select()
    .from(termsTable)
    .where(and(eq(termsTable.taxonomy, taxonomy), eq(termsTable.slug, slug)))
    .get();
  if (existing) return existing.id;
  const id = newId();
  db.insert(termsTable).values({ id, taxonomy, slug, name, createdAt: nowIso() }).run();
  return id;
}

export function setPostTerms(db: DB, postId: string, refs: { taxonomy: string; name: string }[]): void {
  db.delete(postTerms).where(eq(postTerms.postId, postId)).run();
  const seen = new Set<string>();
  for (const t of refs) {
    const termId = upsertTerm(db, t.taxonomy, t.name);
    if (seen.has(termId)) continue;
    seen.add(termId);
    db.insert(postTerms).values({ postId, termId }).run();
  }
}

// ---------------------------------------------------------------- settings

export const SETTINGS_DEFAULTS = Settings.parse({});

/** Settings live as one row per key; reads merge stored values over the SDK defaults. */
export function readSettings(db: DB) {
  const rows = db.select().from(settingsTable).all();
  const stored: Record<string, unknown> = {};
  for (const r of rows) stored[r.key] = r.value;
  const merged = Settings.safeParse({ ...SETTINGS_DEFAULTS, ...stored });
  return merged.success ? merged.data : SETTINGS_DEFAULTS;
}

export function writeSettings(db: DB, patch: Record<string, unknown>) {
  const ts = nowIso();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    db.insert(settingsTable)
      .values({ key, value, updatedAt: ts })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: ts } })
      .run();
  }
  return readSettings(db);
}
