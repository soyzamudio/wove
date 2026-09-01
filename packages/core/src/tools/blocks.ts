/**
 * Block-based pages: the shared helpers plus the two read tools (`block.catalog`,
 * `block.validate`). Blocks live in `posts.content` as a JSON `BlocksDoc` whenever
 * `posts.format === "blocks"`.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Block, BlockMeta, BlockProps, BlockType, BlocksDoc, ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import { newId } from "../ids";
import { defineTool } from "./registry";

const D = ToolDescriptions;

/** Ids are stable handles for the builder + AI edits; short is enough. */
export const newBlockId = () => newId(8);

/**
 * Authors (and models) routinely omit `id`. Fill them in *before* validation so a
 * hand-written or generated document is accepted as-is.
 */
export function withBlockIds<T>(raw: T): T {
  if (!raw || typeof raw !== "object") return raw;
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.blocks)) return raw;
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (!b || typeof b !== "object" || Array.isArray(b)) return b;
      const block = b as Record<string, unknown>;
      return typeof block.id === "string" && block.id.length > 0 ? block : { ...block, id: newBlockId() };
    }),
  } as T;
}

/** `BlocksDoc`, but tolerant of blocks with no id. */
export const LooseBlocksDoc = z.preprocess(withBlockIds, BlocksDoc);

/** `Block`, but tolerant of a missing id (used by the AI block tools). */
export const LooseBlock = z.preprocess(
  (b) => (b && typeof b === "object" && !Array.isArray(b) && typeof (b as any).id !== "string"
    ? { ...(b as object), id: newBlockId() }
    : b),
  Block,
);

// ---------------------------------------------------------------- excerpts

const MAX_EXCERPT = 160;

const stripMarkdown = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function truncate(text: string, max = MAX_EXCERPT): string {
  const s = text.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Blocks pages still need a one-line summary for llms.txt, feeds and search results.
 * The first hero's supporting line (or headline) is the closest thing a page has to a
 * standfirst; otherwise fall back to the first prose block.
 */
export function excerptFromDoc(doc: BlocksDoc): string | null {
  for (const b of doc.blocks) {
    // `Block` is a discriminated union built dynamically, so TS cannot narrow `props` here.
    const props = b.props as { subheadline?: string; headline?: string; markdown?: string };
    if (b.type === "hero") {
      const text = (props.subheadline?.trim() || props.headline?.trim()) ?? "";
      if (text) return truncate(stripMarkdown(text));
    }
    if (b.type === "markdown") {
      const text = stripMarkdown(props.markdown ?? "");
      if (text) return truncate(text);
    }
  }
  return null;
}

// ---------------------------------------------------------------- catalog

export interface BlockCatalogEntry {
  type: BlockType;
  name: string;
  description: string;
  propsSchema: unknown;
}

let cachedCatalog: BlockCatalogEntry[] | null = null;

/** The catalog is static; build the JSON schemas once. */
export function blockCatalog(): BlockCatalogEntry[] {
  if (!cachedCatalog) {
    cachedCatalog = BlockType.options.map((type) => ({
      type,
      name: BlockMeta[type].name,
      description: BlockMeta[type].description,
      propsSchema: zodToJsonSchema(BlockProps[type], { $refStrategy: "none", target: "jsonSchema7" }),
    }));
  }
  return cachedCatalog;
}

export const blockCatalogTool = defineTool({
  name: "block.catalog",
  description: D["block.catalog"],
  input: ToolCatalog["block.catalog"].input,
  output: ToolCatalog["block.catalog"].output,
  scopes: ToolCatalog["block.catalog"].scopes,
  mutation: false,
  handler: () => blockCatalog(),
});

export const blockValidate = defineTool({
  name: "block.validate",
  description: D["block.validate"],
  input: z.object({ doc: LooseBlocksDoc }),
  output: ToolCatalog["block.validate"].output,
  scopes: ToolCatalog["block.validate"].scopes,
  mutation: false,
  handler: (_ctx, input) => ({ ok: true as const, doc: input.doc }),
});

export const blockTools = [blockCatalogTool, blockValidate];
