/**
 * Authoring helpers for the built-in site templates.
 *
 * Templates are written as plain data; `defineTemplate` fills in the mechanical bits
 * (block ids, menu item ids, schema defaults) and validates against the SDK contract at
 * module load, so a malformed built-in fails fast instead of at apply time.
 */
import type { z } from "zod";
import { BlockProps, type BlockType, Design, SiteTemplate } from "@wove/sdk";
import { slugify } from "../ids";

/** A block as authored: fully typed props, `id` optional (assigned deterministically). */
export type LooseTemplateBlock = {
  [T in BlockType]: { id?: string; type: T; props: z.input<(typeof BlockProps)[T]> };
}[BlockType];

export interface LooseMenu {
  location: string;
  name: string;
  items: Array<{ id?: string; label: string; href: string }>;
}

export interface TemplateSource {
  meta: { slug: string; name: string; description: string; author?: string; templateVersion?: string };
  design: z.input<typeof Design>;
  menus: LooseMenu[];
  settings?: { siteTitle?: string; tagline?: string };
  pages: Array<{
    slug: string;
    title: string;
    seo?: { title?: string | null; description?: string | null };
    blocks: LooseTemplateBlock[];
  }>;
  samplePosts?: Array<{
    slug: string; title: string; content: string; excerpt?: string;
    terms?: Array<{ taxonomy: string; name: string }>;
  }>;
  media?: Array<{ name: string; mime: string; base64: string }>;
}

/** Block ids only need to be stable within a document; `<type>-<n>` reads well in the builder. */
export function defineTemplate(src: TemplateSource): SiteTemplate {
  return SiteTemplate.parse({
    version: 1,
    meta: { author: "Wove", templateVersion: "1.0.0", ...src.meta },
    design: src.design,
    menus: src.menus.map((m) => ({
      ...m,
      items: m.items.map((it, i) => ({ ...it, id: it.id ?? `${slugify(it.label) || "item"}-${i + 1}` })),
    })),
    settings: src.settings,
    pages: src.pages.map((p) => ({
      ...p,
      blocks: { version: 1, blocks: p.blocks.map((b, i) => ({ ...b, id: b.id ?? `${b.type}-${i + 1}` })) },
    })),
    samplePosts: src.samplePosts ?? [],
    media: src.media ?? [],
  });
}

/**
 * Built-ins bundle no binary assets (`media: []`), but two block types — `logos` and
 * `gallery` — are image-only by contract. Inline SVG data URIs keep those layouts complete
 * and self-contained: nothing to upload, nothing to 404.
 */
export const svgDataUri = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;

/** A flat wordmark, used for the fictional customer logos on the SaaS template. */
export const wordmark = (text: string, color = "#71717a"): string =>
  svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" width="200" height="48">
      <text x="100" y="31" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22"
        font-weight="600" letter-spacing="-0.5" fill="${color}">${text}</text>
    </svg>`,
  );

/** An abstract tile for gallery blocks: two tones and a simple geometric mark. */
export const tile = (bg: string, fg: string, shape: string): string =>
  svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
      <rect width="800" height="600" fill="${bg}"/>${shape.replace(/FG/g, fg)}
    </svg>`,
  );
