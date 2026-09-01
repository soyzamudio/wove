import type { ImageRef } from "@wove/sdk";
import { resolveUrl, type RenderContext } from "./context";

/**
 * Responsive attributes for an ImageRef: intrinsic `width`/`height` so the browser
 * can reserve space (avoiding layout shift), plus a `srcset`/`sizes` pair built from
 * its variants. `sizes` describes the block's layout, so a caller that omits it (a
 * logo, an avatar — always small) gets the plain `src` with no srcset.
 */
export function imgAttrs(img: ImageRef | undefined | null, ctx: RenderContext, sizes?: string) {
  if (!img) return {};
  const variants = (img.variants ?? []).filter((v) => v && v.width > 0);
  const srcSet = sizes && variants.length
    ? variants.map((v) => `${resolveUrl(v.url, ctx)} ${v.width}w`).join(", ")
    : undefined;
  return {
    src: resolveUrl(img.url, ctx),
    ...(srcSet ? { srcSet, sizes } : {}),
    ...(img.width ? { width: img.width } : {}),
    ...(img.height ? { height: img.height } : {}),
  };
}

/** `sizes` values matching each block's layout width. */
export const SIZES = {
  image: "(max-width: 72rem) 100vw, 72rem",
  hero: "(max-width: 860px) 100vw, 50vw",
  gallery: "(max-width: 640px) 100vw, 33vw",
  collection: "(max-width: 640px) 100vw, 25vw",
} as const;
