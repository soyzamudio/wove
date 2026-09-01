// Central place to resolve runtime config. Reads import.meta.env first (per the
// public contract) and falls back to process.env, which is how these values are
// actually supplied when running under `bun` (dev, build, and the standalone
// node-adapter server all populate process.env from the shell).

export const API_URL: string =
  (import.meta.env.AGENTPRESS_API_URL as string | undefined) ??
  process.env.AGENTPRESS_API_URL ??
  "http://localhost:4000";

// MOCK is a runtime (not build-time) switch: read it straight from process.env
// so `MOCK=1 bun ./dist/server/entry.mjs` works even against a build that was
// produced without MOCK set (Vite inlines/DCEs import.meta.env at build time,
// which would otherwise freeze this flag into the bundle).
export const MOCK: boolean = process.env.MOCK === "1";
