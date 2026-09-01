/**
 * Update awareness.
 *
 * THIS IS THE ONLY PHONE-HOME IN WOVE. It is a bare GET of a static JSON file:
 * no query parameters, no custom headers, no request body, no identifiers, no
 * telemetry of any kind. The server learns nothing about this install beyond the
 * fact that some IP asked for a public file — the same as loading a web page.
 * `WOVE_UPDATE_CHECK=0` switches it off entirely and no request is ever made.
 */
import type { Env } from "./env";
import { VERSION } from "./version";

export const UPDATE_URL = "https://updates.usewove.com/latest.json";
export const UPDATE_FALLBACK_URL = "https://api.github.com/repos/soyzamudio/wove/releases/latest";
export const UPDATE_TIMEOUT_MS = 5_000;

export interface UpdateInfo {
  latest: string;
  url: string;
}

export interface CachedUpdate extends UpdateInfo {
  fetchedAt: string;
}

/** Strip a leading `v` and any build/prerelease suffix; compare numeric parts only. */
function parts(v: string): number[] {
  const core = v.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
  return core.split(".").map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Pure semver-ish compare: -1 if a < b, 0 if equal, 1 if a > b.
 * Handles `v` prefixes and missing segments (`1.2` === `1.2.0`).
 * Prerelease/build metadata is deliberately ignored — releases are the only thing
 * we point people at, and "0.2.0-rc.1" vs "0.2.0" is not a distinction worth a banner.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a);
  const pb = parts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export const isNewerVersion = (candidate: string, current: string) =>
  compareVersions(candidate, current) > 0;

/**
 * Off when `WOVE_UPDATE_CHECK=0`, and off under `bun test` so no test suite can reach the
 * network by accident. Tests of the check itself pass an explicit env bag.
 */
export const updateCheckEnabled = (env: Env = process.env) =>
  env.WOVE_UPDATE_CHECK !== "0" && env.NODE_ENV !== "test";

/** The command that upgrades *this* install, picked from how it was deployed. */
export function installHint(env: Env = process.env): string {
  if (env.WOVE_DOCKER === "1") return "docker compose pull && docker compose up -d";
  if (env.WOVE_ENV === "production") return "bun run update  # then restart the service";
  return "git pull && bun install";
}

// ------------------------------------------------------------------ module cache

let cached: CachedUpdate | null = null;

/** The last successful check, or null when none / disabled / current version is newest. */
export const cachedUpdate = (): CachedUpdate | null => cached;

/** Test seam. */
export function setCachedUpdate(u: CachedUpdate | null): void {
  cached = u;
}

async function getJson(url: string): Promise<unknown> {
  // No headers, no query, no body — see the module comment.
  const res = await fetch(url, { signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fromPrimary(): Promise<UpdateInfo | null> {
  const j = (await getJson(UPDATE_URL)) as { version?: unknown; url?: unknown };
  if (typeof j?.version !== "string" || !j.version) return null;
  return { latest: j.version, url: typeof j.url === "string" && j.url ? j.url : UPDATE_URL };
}

async function fromGithub(): Promise<UpdateInfo | null> {
  const j = (await getJson(UPDATE_FALLBACK_URL)) as { tag_name?: unknown; html_url?: unknown };
  if (typeof j?.tag_name !== "string" || !j.tag_name) return null;
  return {
    latest: j.tag_name.replace(/^v/i, ""),
    url: typeof j.html_url === "string" && j.html_url ? j.html_url : UPDATE_FALLBACK_URL,
  };
}

/**
 * Check for a newer release. Returns `{ latest, url }` only when the remote version is
 * strictly newer than `currentVersion`; null when up to date, disabled, or unreachable.
 * Never throws.
 */
export async function checkForUpdate(
  currentVersion: string = VERSION,
  env: Env = process.env,
): Promise<UpdateInfo | null> {
  if (!updateCheckEnabled(env)) return null;
  let info: UpdateInfo | null = null;
  try {
    info = await fromPrimary();
  } catch {
    info = null;
  }
  if (!info) {
    try {
      info = await fromGithub();
    } catch {
      info = null;
    }
  }
  if (!info) return null;
  if (!isNewerVersion(info.latest, currentVersion)) {
    cached = null;
    return null;
  }
  cached = { ...info, fetchedAt: new Date().toISOString() };
  return info;
}

/** Fire-and-forget refresh: safe to call at boot and from the daily scheduler tick. */
export function refreshUpdateCache(
  currentVersion: string = VERSION,
  env: Env = process.env,
): void {
  if (!updateCheckEnabled(env)) return;
  void checkForUpdate(currentVersion, env).catch(() => {
    /* an update check must never be able to affect the running site */
  });
}
