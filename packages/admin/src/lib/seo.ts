/** SEO field helpers: length counters and the Google-style result preview. */

export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

export interface Counter {
  length: number;
  max: number;
  remaining: number;
  over: boolean;
}

export function counter(value: string | null | undefined, max: number): Counter {
  const length = (value ?? "").length;
  return { length, max, remaining: max - length, over: length > max };
}

/** What search engines will actually show as the title. */
export function effectiveSeoTitle(seoTitle: string | null | undefined, postTitle: string): string {
  const t = (seoTitle ?? "").trim();
  return t || postTitle.trim() || "(untitled)";
}

/** Pretty result URL: `example.com › my-slug`, like Google renders breadcrumbs. */
export function previewUrl(siteUrl: string | null | undefined, slug: string): string {
  const base = (siteUrl ?? "").trim().replace(/\/+$/, "");
  const host = base.replace(/^https?:\/\//, "") || "example.com";
  const path = (slug ?? "").replace(/^\/+/, "");
  return path ? `${host} › ${path}` : host;
}

export function truncate(text: string, max: number): string {
  const t = (text ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export interface SeoPreview {
  title: string;
  url: string;
  description: string;
}

/** Everything the preview card renders, derived the way a crawler would. */
export function seoPreview(input: {
  siteUrl?: string | null;
  slug: string;
  postTitle: string;
  seoTitle?: string | null;
  description?: string | null;
  excerpt?: string | null;
}): SeoPreview {
  const description = (input.description ?? "").trim() || (input.excerpt ?? "").trim();
  return {
    title: truncate(effectiveSeoTitle(input.seoTitle, input.postTitle), SEO_TITLE_MAX),
    url: previewUrl(input.siteUrl, input.slug),
    description: description ? truncate(description, SEO_DESCRIPTION_MAX) : "No meta description yet.",
  };
}
