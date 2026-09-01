/**
 * Block model for pages. Section-level, typed, AI-friendly.
 * Shared by core (validation + AI structured output), admin (builder), site (renderer).
 * Stored in `posts.content` as JSON when `post.format === "blocks"`.
 */
import { z } from "zod";

export const BlockId = z.string().min(1);

export const ImageRef = z.object({
  url: z.string().describe("absolute URL or /media/... path"),
  alt: z.string().default(""),
  mediaId: z.string().optional(),
});
export type ImageRef = z.infer<typeof ImageRef>;

export const ButtonSpec = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  variant: z.enum(["primary", "secondary"]).default("primary"),
});
export type ButtonSpec = z.infer<typeof ButtonSpec>;

const Markdown = z.string().describe("Markdown");

// ---- block props ----------------------------------------------------------
export const BlockProps = {
  hero: z.object({
    eyebrow: z.string().optional(),
    headline: z.string().min(1),
    subheadline: z.string().optional(),
    buttons: z.array(ButtonSpec).max(3).default([]),
    image: ImageRef.optional(),
    layout: z.enum(["split", "centered", "background"]).default("split"),
  }),
  features: z.object({
    headline: z.string().optional(),
    intro: z.string().optional(),
    items: z.array(z.object({ icon: z.string().optional().describe("lucide icon name, e.g. 'zap'"), title: z.string(), body: z.string() })).min(1).max(12),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  }),
  markdown: z.object({ markdown: Markdown, width: z.enum(["content", "wide"]).default("content") }),
  image: z.object({ image: ImageRef, caption: z.string().optional(), width: z.enum(["content", "wide", "full"]).default("wide") }),
  gallery: z.object({ images: z.array(ImageRef).min(1), columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3) }),
  cta: z.object({
    headline: z.string().min(1),
    body: z.string().optional(),
    buttons: z.array(ButtonSpec).min(1).max(2),
    style: z.enum(["plain", "card", "dark"]).default("card"),
  }),
  testimonials: z.object({
    headline: z.string().optional(),
    items: z.array(z.object({ quote: z.string(), name: z.string(), role: z.string().optional(), avatar: ImageRef.optional() })).min(1).max(9),
  }),
  logos: z.object({ headline: z.string().optional(), logos: z.array(ImageRef).min(1).max(12) }),
  faq: z.object({ headline: z.string().optional(), items: z.array(z.object({ question: z.string(), answer: Markdown })).min(1).max(20) }),
  stats: z.object({ headline: z.string().optional(), items: z.array(z.object({ value: z.string(), label: z.string() })).min(1).max(6) }),
  columns: z.object({ columns: z.array(z.object({ markdown: Markdown })).min(2).max(4) }),
  html: z.object({ html: z.string().describe("trusted raw HTML (admin-authored)") }),
} as const;

export type BlockType = keyof typeof BlockProps;
export const BlockType = z.enum(Object.keys(BlockProps) as [BlockType, ...BlockType[]]);

const variant = <T extends BlockType>(type: T) => z.object({ id: BlockId, type: z.literal(type), props: BlockProps[type] });
export const BlockSchemas = {
  hero: variant("hero"), features: variant("features"), markdown: variant("markdown"), image: variant("image"),
  gallery: variant("gallery"), cta: variant("cta"), testimonials: variant("testimonials"), logos: variant("logos"),
  faq: variant("faq"), stats: variant("stats"), columns: variant("columns"), html: variant("html"),
} as const;
export const Block = z.discriminatedUnion("type", [
  BlockSchemas.hero, BlockSchemas.features, BlockSchemas.markdown, BlockSchemas.image, BlockSchemas.gallery,
  BlockSchemas.cta, BlockSchemas.testimonials, BlockSchemas.logos, BlockSchemas.faq, BlockSchemas.stats,
  BlockSchemas.columns, BlockSchemas.html,
]);
/** Narrowable union: `switch (block.type)` refines `block.props`. */
export type Block = { [T in BlockType]: { id: string; type: T; props: z.infer<(typeof BlockProps)[T]> } }[BlockType];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const BlocksDoc = z.object({ version: z.literal(1).default(1), blocks: z.array(Block) });
export type BlocksDoc = z.infer<typeof BlocksDoc>;

/** Human descriptions for pickers, AI prompts, and the tools reference. */
export const BlockMeta: Record<BlockType, { name: string; description: string }> = {
  hero: { name: "Hero", description: "Top-of-page statement with headline, supporting text, buttons and an optional image." },
  features: { name: "Features", description: "Grid of feature/benefit cards with optional icons." },
  markdown: { name: "Text", description: "Free-form prose in Markdown." },
  image: { name: "Image", description: "Single image with optional caption." },
  gallery: { name: "Gallery", description: "Grid of images." },
  cta: { name: "Call to action", description: "Headline with one or two buttons." },
  testimonials: { name: "Testimonials", description: "Quotes with names and roles." },
  logos: { name: "Logos", description: "Row of client/partner logos." },
  faq: { name: "FAQ", description: "Expandable question and answer list." },
  stats: { name: "Stats", description: "Row of big numbers with labels." },
  columns: { name: "Columns", description: "2–4 columns of Markdown text." },
  html: { name: "HTML", description: "Raw HTML embed (trusted)." },
};

export const emptyDoc = (): BlocksDoc => ({ version: 1, blocks: [] });

/** Parse a stored content string into a BlocksDoc; throws on invalid. */
export function parseBlocksDoc(content: string): BlocksDoc {
  return BlocksDoc.parse(JSON.parse(content || '{"version":1,"blocks":[]}'));
}
