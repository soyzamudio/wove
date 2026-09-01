import { describe, expect, test } from "bun:test";
import { adminBaseUrl, emailDriverName, emailFrom } from "../env";
import { actionUrl, consoleDriver } from "./drivers/console";
import { parseSmtpUrl } from "./drivers/smtp";
import { resolveDriver, emailStatus, sendEmail, setEmailDriver, type EmailMessage } from "./index";
import { inviteEmail, passwordResetEmail, pendingPostEmail, testEmail } from "./templates";

const BRAND = { siteTitle: "Kestrel", accent: "#ff0055" };

describe("driver selection", () => {
  test("console by default, and an unknown name falls back to it", () => {
    expect(emailDriverName({})).toBe("console");
    expect(emailDriverName({ WOVE_EMAIL_DRIVER: "carrier-pigeon" })).toBe("console");
    expect(emailDriverName({ WOVE_EMAIL_DRIVER: "SMTP" })).toBe("smtp");
    expect(emailDriverName({ WOVE_EMAIL_DRIVER: "resend" })).toBe("resend");
  });

  test("from address has a working default", () => {
    expect(emailFrom({})).toBe("Wove <no-reply@localhost>");
    expect(emailFrom({ WOVE_EMAIL_FROM: "Kestrel <hi@kestrel.dev>" })).toBe("Kestrel <hi@kestrel.dev>");
  });

  test("status reports console as unconfigured", () => {
    expect(emailStatus({})).toEqual({ driver: "console", from: "Wove <no-reply@localhost>", configured: false });
    expect(emailStatus({ WOVE_EMAIL_DRIVER: "resend" }).configured).toBe(true);
    expect(resolveDriver({ WOVE_EMAIL_DRIVER: "smtp" }).name).toBe("smtp");
  });

  test("setEmailDriver overrides everything and restores", async () => {
    const sent: EmailMessage[] = [];
    const restore = setEmailDriver({ name: "resend", async send(m) { sent.push(m); } });
    await sendEmail({ to: "a@b.c", subject: "s", html: "<p>h</p>", text: "t" }, {});
    expect(sent.map((m) => m.to)).toEqual(["a@b.c"]);
    restore();
    expect(resolveDriver({}).name).toBe("console");
  });
});

describe("console driver", () => {
  test("boxes the summary and surfaces the action URL", async () => {
    const lines: string[] = [];
    await consoleDriver((s) => lines.push(s)).send({
      from: "Wove <no-reply@localhost>", to: "you@example.com", subject: "You're invited",
      html: "<p>hi</p>", text: "Accept invitation: http://localhost:5173/accept-invite?token=wove_inv_abc",
    });
    const out = lines.join("\n");
    expect(out).toContain("you@example.com");
    expect(out).toContain("You're invited");
    expect(out).toContain("http://localhost:5173/accept-invite?token=wove_inv_abc");
    expect(out).toContain("┌");
  });

  test("actionUrl trims trailing punctuation and tolerates linkless bodies", () => {
    expect(actionUrl("see https://example.com/x?y=1).")).toBe("https://example.com/x?y=1");
    expect(actionUrl("no links here")).toBeNull();
  });
});

describe("smtp url", () => {
  test("infers TLS from port 465 or the smtps scheme", () => {
    expect(parseSmtpUrl("smtp://u:p@mail.example.com:587").secure).toBe(false);
    expect(parseSmtpUrl("smtp://u:p@mail.example.com:465").secure).toBe(true);
    expect(parseSmtpUrl("smtps://u:p@mail.example.com").secure).toBe(true);
  });
});

describe("templates", () => {
  test("every template carries the brand, a subject and a text alternative", () => {
    const bodies = [
      inviteEmail(BRAND, { acceptUrl: "http://localhost:5173/accept-invite?token=t", role: "author", invitedBy: "Ada" }),
      passwordResetEmail(BRAND, { resetUrl: "http://localhost:5173/reset-password?token=t" }),
      testEmail(BRAND),
      pendingPostEmail(BRAND, { title: "Draft <one>", authorName: "Wren", reviewUrl: "http://localhost:5173/posts/p1" }),
    ];
    for (const b of bodies) {
      expect(b.subject.length).toBeGreaterThan(0);
      expect(b.html).toContain("Kestrel");
      expect(b.html).toContain("#ff0055");
      expect(b.text).toContain("Kestrel");
      expect(b.text).not.toContain("<p");
    }
  });

  test("escapes user-controlled text in the HTML", () => {
    const b = pendingPostEmail(BRAND, { title: '<img src=x onerror="alert(1)">', authorName: null, reviewUrl: "http://x/p" });
    expect(b.html).not.toContain("<img");
    expect(b.html).toContain("&lt;img");
  });

  test("action links appear in both parts", () => {
    const b = inviteEmail(BRAND, { acceptUrl: "http://localhost:5173/accept-invite?token=t", role: "editor" });
    expect(b.html).toContain("/accept-invite?token=t");
    expect(b.text).toContain("/accept-invite?token=t");
  });
});

describe("adminBaseUrl", () => {
  test("dev points at the Vite admin, production at /admin on the site", () => {
    expect(adminBaseUrl({})).toBe("http://localhost:5173");
    expect(adminBaseUrl({ WOVE_SITE_URL: "http://localhost:4321" })).toBe("http://localhost:5173");
    expect(adminBaseUrl({ WOVE_ENV: "production", WOVE_SITE_URL: "https://kestrel.dev/" })).toBe("https://kestrel.dev/admin");
    expect(adminBaseUrl({ WOVE_ENV: "production" })).toBe("http://localhost:5173");
  });
});
