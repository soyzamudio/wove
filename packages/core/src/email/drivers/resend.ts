import type { Env } from "../../env";
import type { EmailDriver } from "../index";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend's REST API. No SDK: one `fetch`, one shape. */
export function resendDriver(env: Env = process.env): EmailDriver {
  const key = env.WOVE_RESEND_KEY?.trim();
  return {
    name: "resend",
    async send(msg) {
      if (!key) throw new Error("WOVE_RESEND_KEY is not set");
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      });
      if (!res.ok) {
        throw new Error(`resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      }
    },
  };
}
