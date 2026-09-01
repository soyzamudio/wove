/**
 * Dashboard email configuration.
 *
 * Mirrors `ai/keys.ts`: three reserved rows in the `settings` table, with the secret at
 * rest encrypted by the same WOVE_SECRET machinery. Env vars stay as the fallback, so a
 * deployment that never opens the dashboard behaves exactly as before.
 */
import { eq } from "drizzle-orm";
import type { EmailDriverName } from "../env";
import type { DB } from "../db";
import { settings as settingsTable } from "../db/schema";
import { nowIso } from "../ids";
import { decryptSecret, encryptSecret } from "../ai/keys";

export const EMAIL_KEYS = {
  driver: "email.driver",
  from: "email.from",
  secret: "email.secret",
} as const;

function readRow(db: DB, key: string): unknown {
  return db.select().from(settingsTable).where(eq(settingsTable.key, key)).get()?.value;
}

function writeRow(db: DB, key: string, value: unknown): void {
  const ts = nowIso();
  db.insert(settingsTable)
    .values({ key, value, updatedAt: ts })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: ts } })
    .run();
}

function deleteRow(db: DB, key: string): void {
  db.delete(settingsTable).where(eq(settingsTable.key, key)).run();
}

const asString = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export interface EmailConfig {
  /** null when the dashboard has no opinion — env decides. */
  driver: EmailDriverName | null;
  from: string | null;
  /** Decrypted; null when unset (or when WOVE_SECRET changed under us). */
  secret: string | null;
}

export function readEmailConfig(db: DB): EmailConfig {
  const raw = asString(readRow(db, EMAIL_KEYS.driver));
  const driver = raw === "smtp" || raw === "resend" || raw === "console" ? raw : null;
  const blob = asString(readRow(db, EMAIL_KEYS.secret));
  return { driver, from: asString(readRow(db, EMAIL_KEYS.from)), secret: blob ? decryptSecret(blob) : null };
}

export function writeEmailConfig(db: DB, patch: { driver?: EmailDriverName; from?: string | null }): void {
  if (patch.driver !== undefined) writeRow(db, EMAIL_KEYS.driver, patch.driver);
  if (patch.from !== undefined) {
    if (patch.from === null || patch.from === "") deleteRow(db, EMAIL_KEYS.from);
    else writeRow(db, EMAIL_KEYS.from, patch.from);
  }
}

export function storeEmailSecret(db: DB, secret: string): void {
  writeRow(db, EMAIL_KEYS.secret, encryptSecret(secret));
}

export function clearEmailSecret(db: DB): void {
  deleteRow(db, EMAIL_KEYS.secret);
}

// ---------------------------------------------------------------- cache invalidation

let version = 0;

/** Bumped by `email.configure` so the memoised driver is rebuilt on the next send. */
export function bumpEmailConfigVersion(): number {
  return ++version;
}

export function emailConfigVersion(): number {
  return version;
}
