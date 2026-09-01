import type { Env } from "../../env";
import type { EmailDriver } from "../index";

/**
 * SMTP via nodemailer. Imported lazily so a deployment on the console/resend driver never
 * pays for the module (and so core still boots if the optional dep is missing).
 *
 * `WOVE_SMTP_URL` looks like `smtp://user:pass@host:587` — `secure` is implied by port 465
 * or an `smtps://` scheme, which is what every provider's docs mean by "SSL".
 */
export function parseSmtpUrl(raw: string): { url: string; secure: boolean } {
  const u = new URL(raw);
  return { url: raw, secure: u.protocol === "smtps:" || u.port === "465" };
}

export function smtpDriver(env: Env = process.env): EmailDriver {
  let transport: { sendMail(o: Record<string, unknown>): Promise<unknown> } | null = null;

  return {
    name: "smtp",
    async send(msg) {
      const raw = env.WOVE_SMTP_URL?.trim();
      if (!raw) throw new Error("WOVE_SMTP_URL is not set");
      if (!transport) {
        const { secure } = parseSmtpUrl(raw);
        const nodemailer = (await import("nodemailer")) as unknown as {
          createTransport: (o: unknown) => { sendMail(o: Record<string, unknown>): Promise<unknown> };
          default?: { createTransport: (o: unknown) => { sendMail(o: Record<string, unknown>): Promise<unknown> } };
        };
        const create = nodemailer.createTransport ?? nodemailer.default?.createTransport;
        if (!create) throw new Error("nodemailer is not installed");
        transport = create({ url: raw, secure });
      }
      await transport.sendMail({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    },
  };
}
