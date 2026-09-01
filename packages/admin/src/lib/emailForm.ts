import type { ToolInput, ToolOutput } from "@wove/sdk";

export type EmailConfigureInput = ToolInput<"email.configure">;
export type EmailStatus = ToolOutput<"email.status">;

export interface EmailForm {
  driver: EmailStatus["driver"];
  from: string;
  /** Always blank on load — a stored secret is never sent back to the browser. */
  secret: string;
}

/**
 * Only what actually changed. The secret is sent only when the admin typed one (an empty
 * box means "leave the stored secret alone", never "clear it" — that's the Remove button).
 */
export function emailFormDiff(current: EmailStatus, form: EmailForm): EmailConfigureInput {
  const patch: EmailConfigureInput = {};
  if (form.driver !== current.driver) patch.driver = form.driver;
  if (form.from.trim() !== current.from) patch.from = form.from.trim();
  const secret = form.secret.trim();
  if (secret) patch.secret = secret;
  return patch;
}
