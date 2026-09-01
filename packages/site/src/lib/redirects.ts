/**
 * Which missing paths are worth reporting to core's 404 log. Mirrors the filter core
 * applies server-side — doing it here too saves a request per asset 404.
 */
const ASSET_RE = /\.(ico|png|jpg|jpeg|svg|css|js|map|txt|xml|webp|woff2?)$/i;

export function shouldReport404(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  const clean = path.split(/[?#]/)[0]!;
  if (ASSET_RE.test(clean)) return false;
  if (clean === "/api" || clean.startsWith("/api/")) return false;
  if (clean === "/admin" || clean.startsWith("/admin")) return false;
  if (clean.startsWith("/.well-known/")) return false;
  return true;
}
