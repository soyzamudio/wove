import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { desc } from "drizzle-orm";
import { auditLog, settings as settingsTable } from "../db/schema";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";
import { resetEncryptionKey } from "../ai/keys";
import { bumpEmailConfigVersion, EMAIL_KEYS, setEmailDriver, type EmailDriver, type EmailMessage, type EmailStatus } from "../email";
import { isSmtpUrl, isValidFrom } from "./email";

process.env.WOVE_SECRET = "test-secret-for-email-tools";
resetEncryptionKey();

const h = makeHarness();
afterAll(() => h.cleanup());

const status = (r: unknown) => r as EmailStatus;

function reset() {
  h.db.delete(settingsTable).run();
  bumpEmailConfigVersion();
  delete process.env.WOVE_EMAIL_DRIVER;
  delete process.env.WOVE_RESEND_KEY;
  delete process.env.WOVE_SMTP_URL;
  delete process.env.WOVE_EMAIL_FROM;
}

beforeEach(reset);
afterEach(reset);

describe("validators", () => {
  test("from accepts both shapes, rejects junk", () => {
    expect(isValidFrom("you@example.com")).toBe(true);
    expect(isValidFrom("Wove <no-reply@localhost>")).toBe(true);
    expect(isValidFrom("not-an-address")).toBe(false);
    expect(isValidFrom("a@b c@d")).toBe(false);
    expect(isValidFrom("")).toBe(false);
  });

  test("smtp url requires the smtp(s) scheme", () => {
    expect(isSmtpUrl("smtp://user:pass@host:587")).toBe(true);
    expect(isSmtpUrl("smtps://user:pass@host:465")).toBe(true);
    expect(isSmtpUrl("https://host")).toBe(false);
    expect(isSmtpUrl("host:587")).toBe(false);
  });
});

describe("email.configure", () => {
  test("stores a dashboard secret, masks the hint, and never echoes the secret", async () => {
    const out = status(unwrap(await h.call(ADMIN, "email.configure", { driver: "resend", secret: "re_test123", from: "Kestrel <hi@kestrel.dev>" })));
    expect(out).toEqual({
      driver: "resend", from: "Kestrel <hi@kestrel.dev>", configured: true, source: "dashboard", secretHint: "…t123",
    });
    expect(JSON.stringify(out)).not.toContain("re_test123");

    // At rest the row is ciphertext, not the key.
    const row = h.db.select().from(settingsTable).all().find((r) => r.key === EMAIL_KEYS.secret);
    expect(String(row?.value)).toStartWith("v1.");
    expect(String(row?.value)).not.toContain("re_test123");

    expect(status(unwrap(await h.call(ADMIN, "email.status", {})))).toMatchObject({ source: "dashboard", secretHint: "…t123" });
  });

  test("env is the fallback, and dashboard config beats it", async () => {
    process.env.WOVE_EMAIL_DRIVER = "resend";
    process.env.WOVE_RESEND_KEY = "re_from_env";
    process.env.WOVE_EMAIL_FROM = "Env <env@example.com>";
    expect(status(unwrap(await h.call(ADMIN, "email.status", {})))).toEqual({
      driver: "resend", from: "Env <env@example.com>", configured: true, source: "env", secretHint: null,
    });

    const out = status(unwrap(await h.call(ADMIN, "email.configure", { driver: "smtp", secret: "smtp://u:p@mail.test:587" })));
    expect(out).toMatchObject({ driver: "smtp", source: "dashboard", secretHint: "…:587", from: "Env <env@example.com>" });
  });

  test("clearSecret + console falls back to env/none, and the driver keeps its secret otherwise", async () => {
    await h.call(ADMIN, "email.configure", { driver: "resend", secret: "re_abcd" });
    // Switching to console keeps the secret for switching back.
    let out = status(unwrap(await h.call(ADMIN, "email.configure", { driver: "console" })));
    expect(out).toMatchObject({ driver: "console", configured: false, source: "none", secretHint: "…abcd" });
    out = status(unwrap(await h.call(ADMIN, "email.configure", { driver: "resend" })));
    expect(out).toMatchObject({ driver: "resend", source: "dashboard", secretHint: "…abcd" });

    out = status(unwrap(await h.call(ADMIN, "email.configure", { driver: "console", clearSecret: true })));
    expect(out).toEqual({
      driver: "console", from: "Wove <no-reply@localhost>", configured: false, source: "none", secretHint: null,
    });
  });

  test("rejects smtp without a secret, a non-smtp secret, and a bad from", async () => {
    let r = await h.call(ADMIN, "email.configure", { driver: "smtp" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.status).toBe(400);
    expect(r.ok === false && r.error.message).toContain("smtp://");

    r = await h.call(ADMIN, "email.configure", { driver: "smtp", secret: "https://not-smtp" });
    expect(r.ok === false && r.status).toBe(400);

    r = await h.call(ADMIN, "email.configure", { driver: "resend" });
    expect(r.ok === false && r.status).toBe(400);

    r = await h.call(ADMIN, "email.configure", { from: "nope" });
    expect(r.ok === false && r.status).toBe(400);
    expect(r.ok === false && r.error.message).toContain("not a valid from address");
  });

  test("audit redacts the secret", async () => {
    await h.call(ADMIN, "email.configure", { driver: "resend", secret: "re_supersecret" });
    const row = h.db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(5).all()
      .find((r) => r.tool === "email.configure");
    const input = JSON.stringify(row?.input ?? "");
    expect(input).not.toContain("re_supersecret");
    expect(input).toContain("[redacted]");
  });
});

describe("email.test", () => {
  test("uses the dashboard driver, and the fake-driver seam still wins", async () => {
    await h.call(ADMIN, "email.configure", { driver: "resend", secret: "re_abcd", from: "Kestrel <hi@kestrel.dev>" });
    expect(status(unwrap(await h.call(ADMIN, "email.status", {}))).driver).toBe("resend");

    const sent: (EmailMessage & { from: string })[] = [];
    const fake: EmailDriver = { name: "console", async send(m) { sent.push(m); } };
    const restore = setEmailDriver(fake);
    try {
      unwrap(await h.call(ADMIN, "email.test", { to: "you@example.com" }));
      expect(sent).toHaveLength(1);
      // The dashboard `from` is used even though the seam supplied the transport.
      expect(sent[0]!.from).toBe("Kestrel <hi@kestrel.dev>");
      expect(status(unwrap(await h.call(ADMIN, "email.status", {}))).driver).toBe("console");
    } finally {
      restore();
    }
  });
});
