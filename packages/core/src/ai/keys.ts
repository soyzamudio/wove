import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import type { AiConfig, AiKeySource, AiProvider } from "@agentpress/sdk";
import { AiProvider as AiProviderSchema } from "@agentpress/sdk";
import type { DB } from "../db";
import { settings as settingsTable } from "../db/schema";
import { nowIso } from "../ids";
import { DEFAULT_MODELS, DEFAULT_PROVIDER } from "./defaults";

// ---------------------------------------------------------------- settings rows

/** AI config lives in the same `settings` table under a reserved `ai.` prefix. */
export const AI_KEYS = {
  provider: "ai.provider",
  model: "ai.model",
  baseUrl: "ai.baseUrl",
  systemPrompt: "ai.systemPrompt",
  apiKey: "ai.apiKey",
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

// ---------------------------------------------------------------- secret material

let cachedSecret: Buffer | null = null;

export function secretPath(): string {
  return process.env.AGENTPRESS_SECRET_FILE ?? join(process.cwd(), "data", "secret");
}

/**
 * The 32-byte AES key, derived (sha256) from `AGENTPRESS_SECRET`. When that env var is
 * unset we generate a secret once and persist it to ./data/secret (0600) so stored keys
 * survive a restart.
 */
export function encryptionKey(): Buffer {
  if (cachedSecret) return cachedSecret;
  let secret = process.env.AGENTPRESS_SECRET;
  if (!secret) {
    const path = secretPath();
    if (existsSync(path)) {
      secret = readFileSync(path, "utf8").trim();
    } else {
      secret = randomBytes(32).toString("hex");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, secret, { mode: 0o600 });
      console.warn(`[ai] AGENTPRESS_SECRET is not set — generated one at ${path}. Back it up: losing it invalidates stored API keys.`);
    }
  }
  cachedSecret = createHash("sha256").update(secret).digest();
  return cachedSecret;
}

/** Test seam: forget the memoised key (e.g. after changing AGENTPRESS_SECRET). */
export function resetEncryptionKey(): void {
  cachedSecret = null;
}

/** AES-256-GCM. Wire format: `v1.<iv b64>.<tag b64>.<ciphertext b64>`. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string | null {
  try {
    const [v, ivB64, tagB64, ctB64] = blob.split(".");
    if (v !== "v1" || !ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- config

export interface AiSettings {
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  systemPrompt: string | null;
}

export function readAiSettings(db: DB): AiSettings {
  const rawProvider = asString(readRow(db, AI_KEYS.provider));
  const parsed = AiProviderSchema.safeParse(rawProvider);
  const provider = parsed.success ? parsed.data : DEFAULT_PROVIDER;
  return {
    provider,
    model: asString(readRow(db, AI_KEYS.model)) ?? DEFAULT_MODELS[provider],
    baseUrl: asString(readRow(db, AI_KEYS.baseUrl)),
    systemPrompt: asString(readRow(db, AI_KEYS.systemPrompt)),
  };
}

export function writeAiSettings(db: DB, patch: Partial<AiSettings>): void {
  for (const [field, key] of [
    ["provider", AI_KEYS.provider],
    ["model", AI_KEYS.model],
    ["baseUrl", AI_KEYS.baseUrl],
    ["systemPrompt", AI_KEYS.systemPrompt],
  ] as const) {
    const value = patch[field];
    if (value === undefined) continue;
    if (value === null || value === "") deleteRow(db, key);
    else writeRow(db, key, value);
  }
}

// ---------------------------------------------------------------- keys

export function storeSiteKey(db: DB, key: string): void {
  writeRow(db, AI_KEYS.apiKey, encryptSecret(key));
}

export function clearSiteKey(db: DB): void {
  deleteRow(db, AI_KEYS.apiKey);
}

export function readSiteKey(db: DB): string | null {
  const blob = asString(readRow(db, AI_KEYS.apiKey));
  return blob ? decryptSecret(blob) : null;
}

/** `AGENTPRESS_AI_ANTHROPIC_KEY`, `AGENTPRESS_AI_OPENAI_COMPATIBLE_KEY`, … */
export function envVarFor(provider: AiProvider): string {
  return `AGENTPRESS_AI_${provider.toUpperCase().replace(/-/g, "_")}_KEY`;
}

export interface ResolvedKey {
  key: string | null;
  source: AiKeySource;
}

/** Site key (BYOK) wins over the platform env key; otherwise none. */
export function resolveKey(db: DB, provider: AiProvider): ResolvedKey {
  const site = readSiteKey(db);
  if (site) return { key: site, source: "byok" };
  const env = process.env[envVarFor(provider)];
  if (env) return { key: env, source: "platform" };
  return { key: null, source: "none" };
}

/** `…4f2a` for a stored site key; null when the key is a platform key or absent. */
export function keyHint(db: DB): string | null {
  const site = readSiteKey(db);
  return site ? `…${site.slice(-4)}` : null;
}

export function aiConfig(db: DB): AiConfig {
  const s = readAiSettings(db);
  return {
    ...s,
    keySource: resolveKey(db, s.provider).source,
    keyHint: keyHint(db),
  };
}
