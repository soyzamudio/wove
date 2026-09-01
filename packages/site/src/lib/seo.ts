import type { ImageRef, Post } from "@wove/sdk";

export interface ResolvedSeo {
  title: string;
  description: string | null;
  ogImage: string | null;
  noindex: boolean;
}

/** Absolute-ify a possibly-relative media URL against core's origin. */
export function resolveUrl(url: string, apiUrl: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = apiUrl.replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function resolveImage(image: ImageRef | null | undefined, apiUrl: string): string | null {
  if (!image?.url) return null;
  return resolveUrl(image.url, apiUrl);
}

/**
 * Resolve a post's effective SEO fields, applying fallbacks: seo.title →
 * post.title, seo.description → post.excerpt, seo.ogImage → featuredImage.
 * Pure function (no I/O) so it's directly unit-testable.
 */
export function resolveSeo(post: Post, apiUrl: string): ResolvedSeo {
  return {
    title: post.seo.title ?? post.title,
    description: post.seo.description ?? post.excerpt,
    ogImage: resolveImage(post.seo.ogImage, apiUrl) ?? resolveImage(post.featuredImage, apiUrl),
    noindex: post.seo.noindex,
  };
}
