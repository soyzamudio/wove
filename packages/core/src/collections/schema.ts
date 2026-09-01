/**
 * Collections turn a user-defined field list into a zod schema, so entry `data` is
 * validated by the same machinery as every other tool input.
 *
 * Two shapes come out of one definition:
 *  - `entrySchemaFor(collection)` — the zod object entries are parsed with.
 *  - `entryJsonSchema(collection)` — its JSON-schema rendering, handed to agents on
 *    `collection.list` / `collection.get` so they can learn a collection's shape without
 *    guessing. Cached per (slug, updatedAt).
 *
 * Strictness is deliberate: unknown keys are a 400, not a silent strip, because the whole
 * point of publishing the schema is that a caller can get it right. The one exception is
 * data that predates a field being removed — see `validateEntryData` in tools/collections.ts,
 * which keeps those orphans and only ever validates the keys the collection still declares.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ImageRef, type CollectionField } from "@wove/sdk";
import { badRequest } from "../tools/registry";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CollectionShape {
  slug: string;
  fields: CollectionField[];
  updatedAt?: string;
}

/** The zod type one field accepts, before required/optional is applied. */
function baseTypeFor(field: CollectionField): z.ZodTypeAny {
  switch (field.type) {
    case "text":
    case "textarea":
    case "markdown":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "date":
      return z.string().regex(ISO_DATE_RE, "expected a YYYY-MM-DD date");
    case "select": {
      const options = field.options ?? [];
      if (options.length === 0) {
        throw badRequest(`Field "${field.key}" is a select but has no options`, { field: field.key });
      }
      return z.enum(options as [string, ...string[]]);
    }
    case "image":
      return ImageRef;
    case "url":
      return z.string().url();
  }
}

/**
 * The zod object a collection's entry `data` is parsed with. Required fields must be
 * present; everything else is optional *and* nullable, so a caller can send an explicit
 * null (which `entry.update` reads as "clear this key").
 *
 * Throws a 400 for a definition that cannot produce a schema (a select with no options),
 * which is why collection.create/update call it before writing anything.
 */
export function entrySchemaFor(collection: CollectionShape): z.ZodObject<z.ZodRawShape, "strict"> {
  const shape: z.ZodRawShape = {};
  for (const field of collection.fields) {
    const base = baseTypeFor(field);
    shape[field.key] = field.required ? base : base.optional().nullable();
  }
  return z.object(shape).strict();
}

const cache = new Map<string, { updatedAt: string; schema: unknown }>();

/** JSON-schema rendering of `entrySchemaFor`, cached against the collection's updatedAt. */
export function entryJsonSchema(collection: CollectionShape): unknown {
  const key = collection.slug;
  const stamp = collection.updatedAt ?? "";
  const hit = cache.get(key);
  if (hit && hit.updatedAt === stamp) return hit.schema;
  const schema = zodToJsonSchema(entrySchemaFor(collection), { $refStrategy: "none", target: "jsonSchema7" });
  cache.set(key, { updatedAt: stamp, schema });
  return schema;
}

/** Drops a collection's cached JSON schema (delete; also cheap insurance on rename). */
export function forgetEntrySchema(slug: string): void {
  cache.delete(slug);
}
