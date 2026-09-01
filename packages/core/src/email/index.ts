/**
 * Outbound email.
 *
 * One tiny interface, three drivers. `console` is the default so every dev flow that
 * emails (invites, password resets, pending-post notifications) works with zero
 * configuration — the message, and any action URL in it, is logged.
 */
import type { Env } from "../env";
import { emailDriverName, emailFrom, type EmailDriverName } from "../env";
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

export interface EmailStatus {
  driver: EmailDriverName;
  from: string;
  configured: boolean;
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

export function resolveDriver(env: Env = process.env): EmailDriver {
  if (override) return override;
  switch (emailDriverName(env)) {
    case "resend":
      return resendDriver(env);
    case "smtp":
      return smtpDriver(env);
    default:
      return consoleDriver();
  }
}

export function emailStatus(env: Env = process.env): EmailStatus {
  const driver = resolveDriver(env);
  return { driver: driver.name, from: emailFrom(env), configured: driver.name !== "console" };
}

/** Send. Throws on driver failure — callers that must not fail use `sendEmailQuietly`. */
export async function sendEmail(msg: EmailMessage, env: Env = process.env): Promise<void> {
  await resolveDriver(env).send({ ...msg, from: emailFrom(env) });
}

/** Fire-and-forget: notifications must never break the write that triggered them. */
export function sendEmailQuietly(msg: EmailMessage, env: Env = process.env): void {
  void sendEmail(msg, env).catch((e) => console.error("[email] send failed:", (e as Error)?.message));
}

export * from "./templates";
