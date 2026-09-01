/**
 * Serving the built admin SPA from core, so a production deployment is one process:
 * core answers `/api`, `/mcp`, `/media` and hands `/admin/*` to Vite's output.
 *
 * Only enabled in production mode — in dev the admin is served by Vite on :5173 and this
 * module is never mounted.
 */
import { existsSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";

export const ADMIN_PREFIX = "/admin";

/** Hashed Vite output is safe to cache forever; the entry HTML never is. */
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
export const NO_CACHE = "no-cache, no-store, must-revalidate";

export interface AdminServer {
  /** Absolute directory the files come from. */
  dir: string;
  /** False when the directory is missing — every request then 404s. */
  available: boolean;
  /** `null` when the path is outside `/admin`. */
  handle(path: string): Promise<Response | null>;
}

const notFound = () =>
  new Response(JSON.stringify({ code: "not_found", message: "File not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

/**
 * Resolve a URL path to a file inside `dir`, or null if it escapes (`..`, absolute
 * segments, encoded separators). Every request goes through this before touching disk.
 */
export function resolveWithin(dir: string, relative: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const root = resolve(dir);
  const target = resolve(root, "." + (decoded.startsWith("/") ? decoded : `/${decoded}`));
  const normalized = normalize(target);
  return normalized === root || normalized.startsWith(root + sep) ? normalized : null;
}

/**
 * Static handler for `/admin` and `/admin/*`.
 *
 * - `/admin/assets/*` — served verbatim, immutable cache, 404 (never SPA fallback) when
 *   missing, so a stale hashed reference fails loudly instead of returning HTML.
 * - anything else — the file if it exists, otherwise `index.html` so client-side routes
 *   like `/admin/posts/123` deep-link correctly.
 */
export function createAdminServer(dir: string): AdminServer {
  const root = resolve(dir);
  const indexPath = join(root, "index.html");
  const available = existsSync(root) && existsSync(indexPath);
  if (!available) {
    console.warn(
      `[admin] no built admin at ${root} — /admin will 404. Run \`bun run --cwd packages/admin build\` or set WOVE_ADMIN_DIST.`,
    );
  }

  const file = async (path: string, cacheControl: string): Promise<Response | null> => {
    const f = Bun.file(path);
    if (!(await f.exists())) return null;
    return new Response(f, {
      headers: {
        "content-type": f.type || "application/octet-stream",
        "cache-control": cacheControl,
      },
    });
  };

  return {
    dir: root,
    available,
    async handle(path: string): Promise<Response | null> {
      if (path !== ADMIN_PREFIX && !path.startsWith(`${ADMIN_PREFIX}/`)) return null;
      if (!available) return notFound();

      const rest = path.slice(ADMIN_PREFIX.length).replace(/^\/+/, "");
      const isAsset = rest.startsWith("assets/");
      if (rest) {
        const target = resolveWithin(root, rest);
        if (!target) return notFound();
        const hit = await file(target, isAsset ? IMMUTABLE_CACHE : NO_CACHE);
        if (hit) return hit;
        if (isAsset) return notFound();
      }
      // SPA fallback
      return (await file(indexPath, NO_CACHE)) ?? notFound();
    },
  };
}
