import type { Collection, CollectionEntry } from "@wove/sdk";

/** A collection's definition plus the entries to render, prefetched by the host. */
export type CollectionData = {
  collection: Pick<Collection, "slug" | "name" | "namePlural" | "fields" | "titleFieldKey">;
  entries: CollectionEntry[];
};

/** Rendering context passed down from the host (admin canvas or Astro site). */
export type RenderContext = {
  /** Prefix applied to root-relative `/media/...` urls (e.g. the API origin). */
  mediaBase?: string;
  /** Prefix applied to other root-relative links (e.g. a site sub-path). */
  linkBase?: string;
  /**
   * Collection data keyed by collection slug, prefetched by the host so the
   * renderer stays synchronous. Collections missing here render a placeholder.
   */
  collections?: Record<string, CollectionData>;
};

const stripTrailing = (s: string) => s.replace(/\/+$/, "");

/**
 * Resolve a url for rendering. Absolute urls (http:, https:, //, mailto:, tel:,
 * data:) and fragments/queries are returned untouched. `/media/...` paths get
 * `ctx.mediaBase`; other root-relative paths get `ctx.linkBase`.
 */
export function resolveUrl(url: string | undefined | null, ctx: RenderContext = {}): string {
  if (!url) return "";
  const u = String(url).trim();
  if (!u) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//")) return u;
  if (u.startsWith("#") || u.startsWith("?")) return u;
  if (!u.startsWith("/")) return u;
  if (u.startsWith("/media/") || u === "/media") {
    return ctx.mediaBase ? stripTrailing(ctx.mediaBase) + u : u;
  }
  return ctx.linkBase ? stripTrailing(ctx.linkBase) + u : u;
}
