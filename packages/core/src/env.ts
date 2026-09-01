/**
 * Every production-only behaviour in core is switched on by an environment variable, and
 * every default here reproduces the dev behaviour core had before hardening. This module
 * is the single place those variables are read and normalised.
 *
 * Functions take an explicit `env` bag (defaulting to `process.env`) so tests can drive
 * them without mutating the process.
 */
import { join } from "node:path";

export type Env = Record<string, string | undefined>;

const truthy = (v: string | undefined) => v === "1" || v === "true" || v === "yes";

/** `production` when either WOVE_ENV or NODE_ENV says so; `development` otherwise. */
export function mode(env: Env = process.env): "production" | "development" {
  return env.WOVE_ENV === "production" || env.NODE_ENV === "production" ? "production" : "development";
}

export const isProduction = (env: Env = process.env) => mode(env) === "production";

/** Where the built admin SPA lives. Defaults to `packages/admin/dist`. */
export function adminDist(env: Env = process.env): string {
  return env.WOVE_ADMIN_DIST ?? join(import.meta.dir, "..", "..", "admin", "dist");
}

/** Origin of the public site to reverse-proxy to, or null when core serves API only. */
export function siteUpstream(env: Env = process.env): string | null {
  const raw = env.WOVE_SITE_UPSTREAM?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    console.warn(`[env] WOVE_SITE_UPSTREAM is not a valid URL: ${raw} — proxy disabled`);
    return null;
  }
}

/** Origins that are always allowed so `bun run dev` keeps working untouched. */
export const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:4321"] as const;

/** Dev defaults ∪ WOVE_CORS_ORIGINS ∪ the origin of WOVE_SITE_URL. */
export function corsOrigins(env: Env = process.env): string[] {
  const out = new Set<string>(DEV_ORIGINS);
  for (const o of (env.WOVE_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      out.add(new URL(o).origin);
    } catch {
      out.add(o);
    }
  }
  if (env.WOVE_SITE_URL) {
    try {
      out.add(new URL(env.WOVE_SITE_URL).origin);
    } catch {
      /* ignore a malformed site url */
    }
  }
  return [...out];
}

/** `Secure` on the session cookie: implied by an https site URL, forced by WOVE_SECURE_COOKIES=1. */
export function secureCookies(env: Env = process.env): boolean {
  if (truthy(env.WOVE_SECURE_COOKIES)) return true;
  return (env.WOVE_SITE_URL ?? "").toLowerCase().startsWith("https://");
}

/** Only trust `x-forwarded-*` when something in front of core is known to set them. */
export const trustProxy = (env: Env = process.env) => truthy(env.WOVE_TRUST_PROXY);

export const rateLimitEnabled = (env: Env = process.env) => env.WOVE_RATE_LIMIT !== "0";

function int(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const aiRateLimit = (env: Env = process.env) => int(env.WOVE_AI_RATE_LIMIT, 30);

export interface RetentionDays {
  auditLog: number;
  aiUsage: number;
  trash: number;
  imports: number;
}

/** Days to keep each kind of record. `0` disables pruning for that kind. */
export function retentionDays(env: Env = process.env): RetentionDays {
  return {
    auditLog: int(env.WOVE_AUDIT_RETENTION_DAYS, 90),
    aiUsage: int(env.WOVE_AI_USAGE_RETENTION_DAYS, 365),
    trash: int(env.WOVE_TRASH_RETENTION_DAYS, 30),
    imports: int(env.WOVE_IMPORTS_RETENTION_DAYS, 30),
  };
}

/**
 * Where the admin UI lives, for links inside emails. In production the SPA is served by
 * core under `/admin`; in development it is the Vite dev server on 5173. Getting this
 * wrong sends invitees to the public site with a token they cannot use.
 */
export function adminBaseUrl(env: Env = process.env): string {
  const site = env.WOVE_SITE_URL?.trim().replace(/\/+$/, "");
  if (isProduction(env) && site) return `${site}/admin`;
  return "http://localhost:5173";
}

export type EmailDriverName = "console" | "smtp" | "resend";

/** `console` unless asked otherwise, so a fresh checkout can complete every email flow. */
export function emailDriverName(env: Env = process.env): EmailDriverName {
  const raw = env.WOVE_EMAIL_DRIVER?.trim().toLowerCase();
  if (raw === "smtp" || raw === "resend" || raw === "console") return raw;
  if (raw) console.warn(`[env] unknown WOVE_EMAIL_DRIVER "${raw}" — falling back to console`);
  return "console";
}

export const emailFrom = (env: Env = process.env) =>
  env.WOVE_EMAIL_FROM?.trim() || "Wove <no-reply@localhost>";
