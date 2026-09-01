// Central place to resolve runtime config. Reads import.meta.env first (per the
// public contract) and falls back to process.env, which is how these values are
// actually supplied when running under `bun` (dev, build, and the standalone
// node-adapter server all populate process.env from the shell).

export const API_URL: string =
  (import.meta.env.WOVE_API_URL as string | undefined) ??
  process.env.WOVE_API_URL ??
  "http://localhost:4000";

// The origin used to build *public*, browser-facing absolute URLs (OG images,
// rewritten `/media/...` links in rendered content, block media). In a
// single-origin deployment the core API sits behind the same public host as
// the site (reverse-proxied), so this can differ from API_URL, which is the
// (possibly internal/loopback) address the server uses to talk to core.
// Falls back to API_URL when unset, which matches the previous behavior.
export const PUBLIC_URL: string =
  (import.meta.env.WOVE_PUBLIC_URL as string | undefined) ??
  process.env.WOVE_PUBLIC_URL ??
  API_URL;

// MOCK is a runtime (not build-time) switch: read it straight from process.env
// so `MOCK=1 bun ./dist/server/entry.mjs` works even against a build that was
// produced without MOCK set (Vite inlines/DCEs import.meta.env at build time,
// which would otherwise freeze this flag into the bundle).
export const MOCK: boolean = process.env.MOCK === "1";
