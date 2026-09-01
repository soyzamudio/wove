import sharp from "sharp";

export interface Dimensions {
  width: number | null;
  height: number | null;
}

export interface VariantRendition {
  width: number;
  format: "webp";
  bytes: Uint8Array;
}

/** Target widths for generated renditions, plus the cap for the largest rendition. */
export const VARIANT_WIDTHS = [480, 960, 1600] as const;
export const MAX_VARIANT_WIDTH = 3200;
const WEBP_QUALITY = 80;

/** Raster formats sharp can decode and re-encode to webp. */
const RASTER_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif"]);

export const isRasterImage = (mime: string) => RASTER_MIMES.has(mime.toLowerCase().split(";")[0]!.trim());
export const isSvg = (mime: string) => mime.toLowerCase().split(";")[0]!.trim() === "image/svg+xml";

/**
 * Widths to render for an original of `originalWidth`. Never upscales: only the
 * standard widths smaller than the original are used, plus the original itself
 * (or a 3200px rendition when the original is larger than that).
 */
export function variantWidthsFor(originalWidth: number): number[] {
  const widths = new Set<number>(VARIANT_WIDTHS.filter((w) => w < originalWidth));
  widths.add(Math.min(originalWidth, MAX_VARIANT_WIDTH));
  return [...widths].sort((a, b) => a - b);
}

/** Read width/height from an SVG's `width`/`height` attributes or its viewBox. */
export function svgDimensions(bytes: Uint8Array): Dimensions {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!tag) return { width: null, height: null };
  const px = (v: string | undefined) => {
    if (!v) return null;
    const n = Number.parseFloat(v.trim());
    return Number.isFinite(n) && n > 0 && !/%\s*$/.test(v) ? Math.round(n) : null;
  };
  const w = px(/\bwidth\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
  const h = px(/\bheight\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
  if (w && h) return { width: w, height: h };
  const vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2]! > 0 && parts[3]! > 0) {
      return { width: Math.round(parts[2]!), height: Math.round(parts[3]!) };
    }
  }
  return { width: w, height: h };
}

/** Best-effort dimension probe. Returns nulls for formats we cannot read. */
export async function probeDimensions(bytes: Uint8Array, mime: string): Promise<Dimensions> {
  if (isSvg(mime)) return svgDimensions(bytes);
  if (!isRasterImage(mime)) return { width: null, height: null };
  try {
    const meta = await sharp(bytes).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

/** Render webp variants. SVGs and non-images get none. */
export async function renderVariants(bytes: Uint8Array, mime: string, originalWidth: number | null): Promise<VariantRendition[]> {
  if (!isRasterImage(mime) || !originalWidth || originalWidth <= 0) return [];
  const out: VariantRendition[] = [];
  for (const width of variantWidthsFor(originalWidth)) {
    try {
      const buf = await sharp(bytes, { animated: false })
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      out.push({ width, format: "webp", bytes: new Uint8Array(buf) });
    } catch {
      // A single unrenderable size should not fail the upload.
    }
  }
  return out;
}

/** Probe dimensions and render variants in one pass. */
export async function processImage(bytes: Uint8Array, mime: string) {
  const { width, height } = await probeDimensions(bytes, mime);
  return { width, height, variants: await renderVariants(bytes, mime, width) };
}
