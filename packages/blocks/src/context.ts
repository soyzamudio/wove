/** Rendering context passed down from the host (admin canvas or Astro site). */
export type RenderContext = {
  /** Prefix applied to root-relative `/media/...` urls (e.g. the API origin). */
  mediaBase?: string;
  /** Prefix applied to other root-relative links (e.g. a site sub-path). */
  linkBase?: string;
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
