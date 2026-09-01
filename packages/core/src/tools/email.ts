/**
 * Email configuration tools.
 *
 * `email.configure` is the dashboard half of the resolution order in `email/index.ts`:
 * whatever it stores wins over the WOVE_EMAIL_* env vars. The secret is written encrypted
 * and never leaves the server — status only ever returns a masked tail.
 */
import { ToolCatalog, ToolDescriptions } from "@wove/sdk";
import type { EmailDriverName } from "../env";
import {
  brandFor,
  bumpEmailConfigVersion,
  clearEmailSecret,
  emailStatus,
  readEmailConfig,
  sendEmail,
  storeEmailSecret,
  testEmail,
  writeEmailConfig,
} from "../email";
import { badRequest, defineTool, ToolError } from "./registry";

const D = ToolDescriptions;

/** `Name <addr@host>` or a bare `addr@host`. Deliberately loose — the MTA is the real judge. */
const ADDR = /^[^\s@<>]+@[^\s@<>]+$/;
export function isValidFrom(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  const angled = s.match(/^[^<>]*<\s*([^\s<>]+)\s*>$/);
  return ADDR.test(angled ? angled[1]! : s);
}

export function isSmtpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "smtp:" || u.protocol === "smtps:";
  } catch {
    return false;
  }
}

export const emailStatusTool = defineTool({
  name: "email.status",
  description: D["email.status"],
  input: ToolCatalog["email.status"].input,
  output: ToolCatalog["email.status"].output,
  scopes: ToolCatalog["email.status"].scopes,
  mutation: false,
  handler: (ctx) => emailStatus(process.env, ctx.db),
});

export const emailConfigure = defineTool({
  name: "email.configure",
  description: D["email.configure"],
  input: ToolCatalog["email.configure"].input,
  output: ToolCatalog["email.configure"].output,
  scopes: ToolCatalog["email.configure"].scopes,
  handler: (ctx, input) => {
    const current = readEmailConfig(ctx.db);
    const driver: EmailDriverName = input.driver ?? current.driver ?? "console";
    // What the secret will be once this call lands.
    const secret = input.secret?.trim() || (input.clearSecret ? null : current.secret);

    if (input.from !== undefined && input.from !== "" && !isValidFrom(input.from)) {
      throw badRequest(`"${input.from}" is not a valid from address — use "Name <you@example.com>" or "you@example.com".`);
    }
    if (driver === "smtp" && !secret) {
      throw badRequest("The SMTP driver needs a connection URL like smtp://user:pass@host:587.");
    }
    if (driver === "smtp" && !isSmtpUrl(secret!)) {
      throw badRequest("The SMTP secret must be a URL like smtp://user:pass@host:587 (or smtps:// for port 465).");
    }
    if (driver === "resend" && !secret) {
      throw badRequest("The Resend driver needs an API key (re_…).");
    }

    writeEmailConfig(ctx.db, {
      driver: input.driver,
      from: input.from === undefined ? undefined : input.from.trim() || null,
    });
    // Switching to console keeps the stored secret so switching back needs no re-entry.
    if (input.clearSecret) clearEmailSecret(ctx.db);
    if (input.secret?.trim()) storeEmailSecret(ctx.db, input.secret.trim());

    bumpEmailConfigVersion();
    return emailStatus(process.env, ctx.db);
  },
});

export const emailTest = defineTool({
  name: "email.test",
  description: D["email.test"],
  input: ToolCatalog["email.test"].input,
  output: ToolCatalog["email.test"].output,
  scopes: ToolCatalog["email.test"].scopes,
  handler: async (ctx, input) => {
    const status = emailStatus(process.env, ctx.db);
    try {
      await sendEmail({ to: input.to, ...testEmail(brandFor(ctx.db)) }, process.env, ctx.db);
    } catch (e) {
      throw new ToolError("internal_error", `Could not send from ${status.from}: ${(e as Error)?.message}`);
    }
    return { ok: true as const };
  },
});

export const emailTools = [emailStatusTool, emailConfigure, emailTest];
