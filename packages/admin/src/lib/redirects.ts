/** Pure helpers for the Redirects page — validation and 404-row prefill normalization. */

export interface RedirectValidationResult {
  ok: boolean;
  error?: string;
}

const ABSOLUTE_URL_RE = /^https?:\/\/[^\s]+$/i;

/**
 * Validates a proposed redirect's from/to paths client-side, mirroring the
 * server's expectations (see `Redirect` in packages/sdk/src/schemas.ts):
 * - `from` must start with `/`, contain no whitespace, and not itself be a
 *   full URL (no scheme).
 * - `to` must be a path starting with `/` or an absolute `http(s)://` URL.
 * - `from` and `to` must differ (no redirect to self).
 */
export function validateRedirect(from: string, to: string): RedirectValidationResult {
  const fromTrimmed = from.trim();
  const toTrimmed = to.trim();

  if (!fromTrimmed) return { ok: false, error: "From path is required" };
  if (!toTrimmed) return { ok: false, error: "To path or URL is required" };

  if (/\s/.test(fromTrimmed)) return { ok: false, error: "From path cannot contain spaces" };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(fromTrimmed)) {
    return { ok: false, error: "From must be a path, not a URL" };
  }
  if (!fromTrimmed.startsWith("/")) return { ok: false, error: "From path must start with /" };

  const toIsPath = toTrimmed.startsWith("/");
  const toIsUrl = ABSOLUTE_URL_RE.test(toTrimmed);
  if (!toIsPath && !toIsUrl) {
    return { ok: false, error: "To must be a path starting with / or an http(s):// URL" };
  }

  if (fromTrimmed === toTrimmed) return { ok: false, error: "From and to cannot be the same" };

  return { ok: true };
}

/**
 * Normalizes a 404 log path (which may carry origin/query/hash, e.g. from a
 * referrer or raw request URL) into a bare path suitable for prefilling the
 * redirect create form's "From" field: strips scheme+host and query/hash,
 * and ensures a single leading slash.
 */
export function prefillFrom(path: string): string {
  let p = path.trim();
  if (!p) return "/";

  // Strip scheme + host if present (e.g. "https://example.com/old-path").
  const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i.exec(p);
  if (schemeMatch) {
    p = p.slice(schemeMatch[0].length);
  }

  // Strip query string and hash.
  const queryIdx = p.search(/[?#]/);
  if (queryIdx !== -1) p = p.slice(0, queryIdx);

  if (!p.startsWith("/")) p = "/" + p;

  // Collapse accidental doubled slashes from the join above, but keep a
  // bare "/" intact.
  p = p.replace(/\/{2,}/g, "/");

  return p || "/";
}
