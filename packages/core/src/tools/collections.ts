/**
 * Collections — user-defined content types and their entries.
 *
 * A collection is a name plus a typed field list; an entry is a JSON bag of values that is
 * validated against those fields (see ../collections/schema.ts). Two rules are worth
 * knowing before reading on:
 *
 *  - **Fields are not migrated.** Changing a collection's fields rewrites the definition and
 *    nothing else. Values that belonged to a removed field stay in `data` verbatim, are
 *    ignored on read and on validation, and reappear if the field is added back. That keeps
 *    a mistaken field removal from destroying content, at the cost of some dead JSON.
 *  - **Entries have no review flow in v1.** Post statuses run draft → pending → published and
 *    contributors cannot publish; entry status is just draft | published, and a contributor
 *    who may write an entry may publish it. Ownership still applies: authors and contributors
 *    only reach entries they wrote.
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { Collection, CollectionField, ToolCatalog, ToolDescriptions } from "@wove/sdk";
import type { DB } from "../db";
import { collectionEntries, collections } from "../db/schema";
import { newId, nowIso, slugify } from "../ids";
import { entryJsonSchema, entrySchemaFor, forgetEntrySchema } from "../collections/schema";
import { badRequest, conflict, defineTool, notFound, ToolError, type Ctx } from "./registry";
import { isOwnerScoped } from "./permissions";
import { decodeCursor, encodeCursor } from "./shared";

const D = ToolDescriptions;

/** Slugs the rest of the admin already owns; a collection may not shadow them. */
export const RESERVED_COLLECTION_SLUGS = ["posts", "pages", "media", "settings", "users", "menus"] as const;

type CollectionRow = typeof collections.$inferSelect;
type EntryRow = typeof collectionEntries.$inferSelect;

// ---------------------------------------------------------------- reads

function parseFields(value: unknown): CollectionField[] {
  const parsed = CollectionField.array().safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

function toCollection(row: CollectionRow) {
  return {
    slug: row.slug,
    name: row.name,
    namePlural: row.namePlural,
    icon: row.icon,
    fields: parseFields(row.fields),
    titleFieldKey: row.titleFieldKey,
    public: row.public,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function entryCountFor(db: DB, slug: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(collectionEntries)
    .where(eq(collectionEntries.collection, slug))
    .get();
  return Number(row?.n ?? 0);
}

/** The `Collection` payload plus the two derived fields the catalog promises. */
export function decorate(db: DB, row: CollectionRow) {
  const c = toCollection(row);
  return { ...c, entryCount: entryCountFor(db, c.slug), entrySchema: entryJsonSchema(c) };
}

export function getCollectionRow(db: DB, slug: string): CollectionRow {
  const row = db.select().from(collections).where(eq(collections.slug, slug)).get();
  if (!row) throw notFound(`No collection "${slug}"`);
  return row;
}

function toEntry(row: EntryRow) {
  return {
    id: row.id,
    collection: row.collection,
    status: row.status,
    data: (row.data ?? {}) as Record<string, unknown>,
    authorId: row.authorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------- definition validation

/** Unique keys, a schema that can actually be built, and a title field that exists. */
function validateDefinition(fields: CollectionField[], titleFieldKey: string | undefined, slug: string) {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const f of fields) {
    if (seen.has(f.key)) dupes.push(f.key);
    seen.add(f.key);
  }
  if (dupes.length) {
    throw badRequest(`Duplicate field key(s): ${[...new Set(dupes)].join(", ")}`, { keys: [...new Set(dupes)] });
  }
  // Throws 400 for a definition no schema can be built from (a select with no options).
  entrySchemaFor({ slug, fields });

  const textKeys = fields.filter((f) => f.type === "text").map((f) => f.key);
  if (titleFieldKey === undefined) {
    const first = textKeys[0];
    if (!first) {
      throw badRequest(
        "titleFieldKey is required when the collection has no text field — add a text field or name one explicitly",
        { textFields: [] },
      );
    }
    return first;
  }
  if (!textKeys.includes(titleFieldKey)) {
    throw badRequest(`titleFieldKey "${titleFieldKey}" is not a text field on this collection`, {
      titleFieldKey, textFields: textKeys,
    });
  }
  return titleFieldKey;
}

/** kebab-cased, never a reserved name, never a slug already taken (…-2, …-3). */
function uniqueCollectionSlug(db: DB, base: string): string {
  const root = slugify(base);
  if ((RESERVED_COLLECTION_SLUGS as readonly string[]).includes(root)) {
    throw badRequest(`"${root}" is a reserved slug`, { reserved: RESERVED_COLLECTION_SLUGS });
  }
  let candidate = root;
  let n = 1;
  for (;;) {
    if (!db.select({ slug: collections.slug }).from(collections).where(eq(collections.slug, candidate)).get()) {
      return candidate;
    }
    n += 1;
    candidate = `${root}-${n}`;
  }
}

// ---------------------------------------------------------------- entry data validation

/**
 * Merge `incoming` onto `existing` and validate the result.
 *
 * Unknown keys in `incoming` are a 400 naming them — an agent that has read `entrySchema`
 * has no excuse, and silently dropping a typo'd key loses content. Unknown keys already in
 * `existing` (values orphaned by a field removal) are kept and never validated.
 * A null in `incoming` clears that key.
 */
export function validateEntryData(
  collection: { slug: string; fields: CollectionField[] },
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const known = new Set(collection.fields.map((f) => f.key));
  const unknown = Object.keys(incoming).filter((k) => !known.has(k));
  if (unknown.length) {
    throw badRequest(
      `Unknown field(s) for collection "${collection.slug}": ${unknown.join(", ")}. Known fields: ${[...known].join(", ") || "(none)"}`,
      { unknown, fields: [...known] },
    );
  }

  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }

  const orphans: Record<string, unknown> = {};
  const candidate: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (known.has(k)) candidate[k] = v;
    else orphans[k] = v;
  }

  const parsed = entrySchemaFor(collection).safeParse(candidate);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const named = Object.keys(flat.fieldErrors);
    throw badRequest(
      `Invalid entry data for collection "${collection.slug}"${named.length ? `: ${named.join(", ")}` : ""}`,
      flat,
    );
  }
  return { ...orphans, ...(parsed.data as Record<string, unknown>) };
}

// ---------------------------------------------------------------- ownership

function getEntryRow(ctx: Ctx, collection: string, id: string): EntryRow {
  const row = ctx.db
    .select()
    .from(collectionEntries)
    .where(and(eq(collectionEntries.id, id), eq(collectionEntries.collection, collection)))
    .get();
  if (!row) throw notFound(`No entry "${id}" in collection "${collection}"`);
  return row;
}

/** Authors and contributors reach only entries they wrote; admins/editors/agents reach all. */
function assertCanEditEntry(ctx: Ctx, row: { authorId: string | null }, verb = "edit"): void {
  if (!isOwnerScoped(ctx)) return;
  if (ctx.actor.id && row.authorId === ctx.actor.id) return;
  throw new ToolError("forbidden", `You can only ${verb} your own entries`);
}

// ---------------------------------------------------------------- collection tools

export const collectionList = defineTool({
  name: "collection.list",
  description: D["collection.list"],
  input: ToolCatalog["collection.list"].input,
  output: ToolCatalog["collection.list"].output,
  scopes: ToolCatalog["collection.list"].scopes,
  mutation: false,
  handler: (ctx) =>
    ctx.db.select().from(collections).orderBy(collections.name).all().map((r) => decorate(ctx.db, r)),
});

export const collectionGet = defineTool({
  name: "collection.get",
  description: D["collection.get"],
  input: ToolCatalog["collection.get"].input,
  output: ToolCatalog["collection.get"].output,
  scopes: ToolCatalog["collection.get"].scopes,
  mutation: false,
  handler: (ctx, input) => decorate(ctx.db, getCollectionRow(ctx.db, input.slug)),
});

export const collectionCreate = defineTool({
  name: "collection.create",
  description: D["collection.create"],
  input: ToolCatalog["collection.create"].input,
  output: ToolCatalog["collection.create"].output,
  scopes: ToolCatalog["collection.create"].scopes,
  handler: (ctx, input) => {
    const slug = uniqueCollectionSlug(ctx.db, input.slug ?? input.name);
    const titleFieldKey = validateDefinition(input.fields, input.titleFieldKey, slug);
    const ts = nowIso();
    const row = {
      slug,
      name: input.name,
      namePlural: input.namePlural ?? `${input.name}s`,
      icon: input.icon ?? "database",
      fields: input.fields as unknown[],
      titleFieldKey,
      public: input.public ?? false,
      createdAt: ts,
      updatedAt: ts,
    };
    ctx.db.insert(collections).values(row).run();
    forgetEntrySchema(slug);
    return Collection.parse(toCollection(row as CollectionRow));
  },
});

export const collectionUpdate = defineTool({
  name: "collection.update",
  description: D["collection.update"],
  input: ToolCatalog["collection.update"].input,
  output: ToolCatalog["collection.update"].output,
  scopes: ToolCatalog["collection.update"].scopes,
  handler: (ctx, input) => {
    const prev = getCollectionRow(ctx.db, input.slug);
    const fields = input.fields ?? parseFields(prev.fields);
    // A field change re-checks the title field against the NEW list: dropping the title
    // field without naming a replacement is a 400, not a collection with a dangling title.
    const titleFieldKey = validateDefinition(fields, input.titleFieldKey ?? prev.titleFieldKey, prev.slug);
    const patch = {
      name: input.name ?? prev.name,
      namePlural: input.namePlural ?? prev.namePlural,
      icon: input.icon ?? prev.icon,
      fields: fields as unknown[],
      titleFieldKey,
      public: input.public ?? prev.public,
      updatedAt: nowIso(),
    };
    ctx.db.update(collections).set(patch).where(eq(collections.slug, prev.slug)).run();
    forgetEntrySchema(prev.slug);
    return Collection.parse(toCollection({ ...prev, ...patch }));
  },
});

export const collectionDelete = defineTool({
  name: "collection.delete",
  description: D["collection.delete"],
  input: ToolCatalog["collection.delete"].input,
  output: ToolCatalog["collection.delete"].output,
  scopes: ToolCatalog["collection.delete"].scopes,
  handler: (ctx, input) => {
    const row = getCollectionRow(ctx.db, input.slug);
    const count = entryCountFor(ctx.db, row.slug);
    if (count > 0 && !input.deleteEntries) {
      throw conflict(
        `Collection "${row.slug}" still has ${count} entr${count === 1 ? "y" : "ies"} — pass deleteEntries: true to remove them too`,
        { entryCount: count },
      );
    }
    if (count > 0) ctx.db.delete(collectionEntries).where(eq(collectionEntries.collection, row.slug)).run();
    ctx.db.delete(collections).where(eq(collections.slug, row.slug)).run();
    forgetEntrySchema(row.slug);
    return { ok: true as const, deletedEntries: count };
  },
});

// ---------------------------------------------------------------- entry tools

export const entryList = defineTool({
  name: "entry.list",
  description: D["entry.list"],
  input: ToolCatalog["entry.list"].input,
  output: ToolCatalog["entry.list"].output,
  scopes: ToolCatalog["entry.list"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    getCollectionRow(ctx.db, input.collection);
    const where: any[] = [eq(collectionEntries.collection, input.collection)];
    if (input.status) where.push(eq(collectionEntries.status, input.status));
    // v1 search: a LIKE over the stored JSON. The title field's value lives in there too,
    // so this covers "search by title" without a per-collection index.
    if (input.q) where.push(sql`${collectionEntries.data} like ${`%${input.q}%`}`);
    const offset = decodeCursor(input.cursor);
    const rows = ctx.db
      .select()
      .from(collectionEntries)
      .where(and(...where))
      .orderBy(desc(collectionEntries.createdAt), desc(collectionEntries.id))
      .limit(input.limit + 1)
      .offset(offset)
      .all();
    return {
      items: rows.slice(0, input.limit).map(toEntry),
      nextCursor: rows.length > input.limit ? encodeCursor(offset + input.limit) : null,
    };
  },
});

export const entryGet = defineTool({
  name: "entry.get",
  description: D["entry.get"],
  input: ToolCatalog["entry.get"].input,
  output: ToolCatalog["entry.get"].output,
  scopes: ToolCatalog["entry.get"].scopes,
  mutation: false,
  handler: (ctx, input) => toEntry(getEntryRow(ctx, input.collection, input.id)),
});

export const entryCreate = defineTool({
  name: "entry.create",
  description: D["entry.create"],
  input: ToolCatalog["entry.create"].input,
  output: ToolCatalog["entry.create"].output,
  scopes: ToolCatalog["entry.create"].scopes,
  handler: (ctx, input) => {
    const collection = toCollection(getCollectionRow(ctx.db, input.collection));
    const data = validateEntryData(collection, input.data);
    const ts = nowIso();
    const row = {
      id: newId(),
      collection: collection.slug,
      status: input.status,
      data,
      authorId: ctx.actor.kind === "user" ? ctx.actor.id : null,
      createdAt: ts,
      updatedAt: ts,
    };
    ctx.db.insert(collectionEntries).values(row).run();
    return toEntry(row as EntryRow);
  },
});

export const entryUpdate = defineTool({
  name: "entry.update",
  description: D["entry.update"],
  input: ToolCatalog["entry.update"].input,
  output: ToolCatalog["entry.update"].output,
  scopes: ToolCatalog["entry.update"].scopes,
  handler: (ctx, input) => {
    const collection = toCollection(getCollectionRow(ctx.db, input.collection));
    const prev = getEntryRow(ctx, collection.slug, input.id);
    assertCanEditEntry(ctx, prev);
    const data = input.data
      ? validateEntryData(collection, input.data, (prev.data ?? {}) as Record<string, unknown>)
      : ((prev.data ?? {}) as Record<string, unknown>);
    const patch = { data, status: input.status ?? prev.status, updatedAt: nowIso() };
    ctx.db.update(collectionEntries).set(patch).where(eq(collectionEntries.id, prev.id)).run();
    return toEntry({ ...prev, ...patch });
  },
});

export const entryDelete = defineTool({
  name: "entry.delete",
  description: D["entry.delete"],
  input: ToolCatalog["entry.delete"].input,
  output: ToolCatalog["entry.delete"].output,
  scopes: ToolCatalog["entry.delete"].scopes,
  handler: (ctx, input) => {
    const row = getEntryRow(ctx, input.collection, input.id);
    assertCanEditEntry(ctx, row, "delete");
    ctx.db.delete(collectionEntries).where(eq(collectionEntries.id, row.id)).run();
    return { ok: true as const };
  },
});

export const collectionTools = [
  collectionList, collectionGet, collectionCreate, collectionUpdate, collectionDelete,
  entryList, entryGet, entryCreate, entryUpdate, entryDelete,
];

// ---------------------------------------------------------------- public routes

/**
 * Mounted at `/api/public`. Only collections flagged `public` exist here at all: a private
 * collection 404s rather than 403s, so the public surface never confirms it exists.
 */
export function publicCollectionRoutes(db: DB) {
  const app = new Hono();

  app.get("/collections", (c) => {
    const rows = db.select().from(collections).where(eq(collections.public, true)).orderBy(collections.name).all();
    return c.json(rows.map((r) => decorate(db, r)));
  });

  app.get("/collections/:slug/entries", (c) => {
    const slug = c.req.param("slug");
    const collection = db.select().from(collections).where(eq(collections.slug, slug)).get();
    if (!collection || !collection.public) {
      return c.json({ error: { code: "not_found", message: "Collection not found" } }, 404);
    }
    const q = c.req.query();
    const limit = Math.min(Math.max(Number(q.limit ?? 20) || 20, 1), 100);
    const offset = decodeCursor(q.cursor);
    const rows = db
      .select()
      .from(collectionEntries)
      .where(and(eq(collectionEntries.collection, slug), eq(collectionEntries.status, "published")))
      .orderBy(desc(collectionEntries.createdAt), desc(collectionEntries.id))
      .limit(limit + 1)
      .offset(offset)
      .all();
    return c.json({
      items: rows.slice(0, limit).map(toEntry),
      nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
    });
  });

  return app;
}
