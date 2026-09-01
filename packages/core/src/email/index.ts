/**
 * Outbound email.
 *
 * One tiny interface, three drivers. `console` is the default so every dev flow that
 * emails (invites, password resets, pending-post notifications) works with zero
 * configuration — the message, and any action URL in it, is logged.
 */
import type { Env } from "../env";
import { emailDriverName, emailFrom, type EmailDriverName } from "../env";
import type { DB } from "../db";
import { emailConfigVersion, readEmailConfig } from "./config";
import { consoleDriver } from "./drivers/console";
import { resendDriver } from "./drivers/resend";
import { smtpDriver } from "./drivers/smtp";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailDriver {
  readonly name: EmailDriverName;
  send(msg: EmailMessage & { from: string }): Promise<void>;
}

export type EmailConfigSource = "dashboard" | "env" | "none";

export interface EmailStatus {
  driver: EmailDriverName;
  from: string;
  configured: boolean;
  /** Where the active driver came from; `none` = the console fallback. */
  source: EmailConfigSource;
  /** Masked tail of the dashboard secret (`…abcd`); null when the secret lives in env. */
  secretHint: string | null;
}

let override: EmailDriver | null = null;

/**
 * Test seam: install a fake driver (and get a restore function back). Also used by hosts
 * that want to route email through their own transport.
 */
export function setEmailDriver(driver: EmailDriver | null): () => void {
  const prev = override;
  override = driver;
  return () => {
    override = prev;
  };
}

function build(name: EmailDriverName, env: Env): EmailDriver {
  if (name === "resend") return resendDriver(env);
  if (name === "smtp") return smtpDriver(env);
  return consoleDriver();
}

export interface ResolvedEmail {
  driver: EmailDriver;
  source: EmailConfigSource;
  from: string;
  /** `…abcd` for a dashboard secret; null otherwise. */
  secretHint: string | null;
}

/**
 * Dashboard config wins over env, env wins over the console fallback. The driver instance
 * is memoised (the SMTP transport is expensive) and dropped whenever `email.configure`
 * bumps the config version.
 */
let cache: { key: string; db: DB | undefined; resolved: ResolvedEmail } | null = null;

/** process.env is mutated in place, so the cache key has to include the values we read. */
const cacheKey = (env: Env): string =>
  [emailConfigVersion(), env.WOVE_EMAIL_DRIVER, env.WOVE_EMAIL_FROM, env.WOVE_SMTP_URL, env.WOVE_RESEND_KEY].join("\u0000");

export function resolveEmail(env: Env = process.env, db?: DB): ResolvedEmail {
  const key = cacheKey(env);
  if (cache && cache.key === key && cache.db === db) return cache.resolved;

  const cfg = db ? readEmailConfig(db) : { driver: null, from: null, secret: null };
  const from = cfg.from ?? emailFrom(env);
  const secretHint = cfg.secret ? `…${cfg.secret.slice(-4)}` : null;

  let resolved: ResolvedEmail;
  if (cfg.driver && cfg.driver !== "console") {
    // Dashboard secret shadows the matching env var for this driver only.
    const envVar = cfg.driver === "smtp" ? "WOVE_SMTP_URL" : "WOVE_RESEND_KEY";
    const merged: Env = cfg.secret ? { ...env, [envVar]: cfg.secret } : env;
    resolved = { driver: build(cfg.driver, merged), source: "dashboard", from, secretHint };
  } else if (cfg.driver === "console") {
    // An explicit dashboard choice of console still overrides env — but nothing is configured.
    resolved = { driver: consoleDriver(), source: "none", from, secretHint };
  } else {
    const name = emailDriverName(env);
    resolved = {
      driver: build(name, env),
      source: name === "console" ? "none" : "env",
      from,
      secretHint,
    };
  }

  cache = { key, db, resolved };
  return resolved;
}

export function resolveDriver(env: Env = process.env, db?: DB): EmailDriver {
  if (override) return override;
  return resolveEmail(env, db).driver;
}

export function emailStatus(env: Env = process.env, db?: DB): EmailStatus {
  const r = resolveEmail(env, db);
  // The test/host seam (setEmailDriver) outranks everything, so report what would send.
  const active = resolveDriver(env, db).name;
  return {
    driver: active,
    from: r.from,
    configured: active !== "console",
    source: r.source,
    secretHint: r.secretHint,
  };
}

/** Send. Throws on driver failure — callers that must not fail use `sendEmailQuietly`. */
export async function sendEmail(msg: EmailMessage, env: Env = process.env, db?: DB): Promise<void> {
  await resolveDriver(env, db).send({ ...msg, from: resolveEmail(env, db).from });
}

/** Fire-and-forget: notifications must never break the write that triggered them. */
export function sendEmailQuietly(msg: EmailMessage, env: Env = process.env, db?: DB): void {
  void sendEmail(msg, env, db).catch((e) => console.error("[email] send failed:", (e as Error)?.message));
}

export * from "./templates";
export * from "./config";
