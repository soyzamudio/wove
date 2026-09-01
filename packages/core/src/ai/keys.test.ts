import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { makeHarness } from "../test-helpers";
import {
  aiConfig, clearSiteKey, decryptSecret, encryptSecret, envVarFor,
  keyHint, readSiteKey, resetEncryptionKey, resolveKey, storeSiteKey,
} from "./keys";

const h = makeHarness();
process.env.AGENTPRESS_SECRET = "test-secret-for-ai-keys";
resetEncryptionKey();

afterAll(() => h.cleanup());

beforeEach(() => {
  clearSiteKey(h.db);
  delete process.env.AGENTPRESS_AI_ANTHROPIC_KEY;
});

describe("ai key storage", () => {
  test("encrypt/decrypt roundtrip", () => {
    const blob = encryptSecret("sk-ant-super-secret-4f2a");
    expect(blob).toStartWith("v1.");
    expect(blob).not.toContain("super-secret");
    expect(decryptSecret(blob)).toBe("sk-ant-super-secret-4f2a");
  });

  test("decrypt of a tampered blob returns null instead of throwing", () => {
    const blob = encryptSecret("hello");
    expect(decryptSecret(`${blob.slice(0, -6)}AAAAAA`)).toBe(null); // corrupted ciphertext fails the GCM tag
    expect(decryptSecret("garbage")).toBe(null);
  });

  test("stores and reads back a site key", () => {
    storeSiteKey(h.db, "sk-site-0001");
    expect(readSiteKey(h.db)).toBe("sk-site-0001");
  });

  test("env var names", () => {
    expect(envVarFor("anthropic")).toBe("AGENTPRESS_AI_ANTHROPIC_KEY");
    expect(envVarFor("openai-compatible")).toBe("AGENTPRESS_AI_OPENAI_COMPATIBLE_KEY");
  });

  test("resolution order: byok > platform > none", () => {
    expect(resolveKey(h.db, "anthropic")).toEqual({ key: null, source: "none" });

    process.env.AGENTPRESS_AI_ANTHROPIC_KEY = "env-key";
    expect(resolveKey(h.db, "anthropic")).toEqual({ key: "env-key", source: "platform" });

    storeSiteKey(h.db, "site-key-abcd");
    expect(resolveKey(h.db, "anthropic")).toEqual({ key: "site-key-abcd", source: "byok" });
  });

  test("keyHint masks all but the last 4 chars, and is null for platform/none", () => {
    expect(keyHint(h.db)).toBe(null);
    process.env.AGENTPRESS_AI_ANTHROPIC_KEY = "env-key";
    expect(keyHint(h.db)).toBe(null);
    storeSiteKey(h.db, "sk-ant-xyz-4f2a");
    expect(keyHint(h.db)).toBe("…4f2a");
    expect(aiConfig(h.db).keyHint).toBe("…4f2a");
  });
});
