import { eq } from "drizzle-orm";
import { z } from "zod";
import { Design, ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import type { DB } from "../db";
import { settings as settingsTable } from "../db/schema";
import { nowIso } from "../ids";
import { defineTool } from "./registry";

const D = ToolDescriptions;

/** Design lives in a single `settings` row so it round-trips as one JSON blob. */
export const DESIGN_KEY = "design";

/**
 * `Design.deepPartial()` keeps every `.default(...)`, so an absent key parses back to its
 * default and would clobber the stored value on a patch. Strip the defaults instead, so a
 * patch carries exactly the keys the caller sent.
 */
function toPatchSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  const inner = schema instanceof z.ZodDefault ? (schema._def.innerType as z.ZodTypeAny) : schema;
  if (inner instanceof z.ZodObject) {
    const shape = Object.fromEntries(
      Object.entries(inner.shape as Record<string, z.ZodTypeAny>).map(([k, v]) => [k, toPatchSchema(v)]),
    );
    return z.object(shape).optional();
  }
  return inner.optional();
}

const updateInputSchema = z.object(
  Object.fromEntries(
    Object.entries(Design.shape as Record<string, z.ZodTypeAny>).map(([k, v]) => [k, toPatchSchema(v)]),
  ),
);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Recursive merge of a partial patch into a stored object. `null` clears a value. */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

export function readDesign(db: DB): Design {
  const row = db.select().from(settingsTable).where(eq(settingsTable.key, DESIGN_KEY)).get();
  const parsed = Design.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : Design.parse({});
}

export function writeDesign(db: DB, patch: unknown): Design {
  const row = db.select().from(settingsTable).where(eq(settingsTable.key, DESIGN_KEY)).get();
  // Merge into the *stored* value, not the defaults-filled one, so unset keys stay unset.
  const merged = deepMerge(row?.value ?? {}, patch);
  const value = Design.parse(merged);
  const ts = nowIso();
  db.insert(settingsTable)
    .values({ key: DESIGN_KEY, value, updatedAt: ts })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: ts } })
    .run();
  return value;
}

export const designGet = defineTool({
  name: "design.get",
  description: D["design.get"],
  input: ToolCatalog["design.get"].input,
  output: ToolCatalog["design.get"].output,
  scopes: ToolCatalog["design.get"].scopes,
  mutation: false,
  handler: (ctx) => readDesign(ctx.db),
});

export const designUpdate = defineTool({
  name: "design.update",
  description: D["design.update"],
  input: updateInputSchema,
  output: ToolCatalog["design.update"].output,
  scopes: ToolCatalog["design.update"].scopes,
  // `customCss` is stored verbatim: it is trusted admin-authored content.
  handler: (ctx, input) => writeDesign(ctx.db, input),
});

export const designTools = [designGet, designUpdate];
