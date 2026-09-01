/**
 * Email bodies. Deliberately minimal HTML — tables and inline styles are the only things
 * every client agrees on — branded with the site title and the design accent colour so an
 * invite doesn't look like it came from nowhere.
 */
import type { DB } from "../db";
import { readSettings } from "../tools/shared";
import { readDesign } from "../tools/design";

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

export interface Brand {
  siteTitle: string;
  accent: string;
}

export function brandFor(db: DB): Brand {
  let siteTitle = "Wove";
  let accent = "#2563eb";
  try {
    siteTitle = readSettings(db).siteTitle || siteTitle;
  } catch {
    /* settings unreadable — keep the default */
  }
  try {
    accent = readDesign(db).colors.accent || accent;
  } catch {
    /* design unreadable — keep the default */
  }
  return { siteTitle, accent };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface LayoutInput {
  brand: Brand;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer?: string;
}

export function layout({ brand, heading, paragraphs, action, footer }: LayoutInput): string {
  const button = action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:${escapeHtml(brand.accent)};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 8px;font-size:13px;color:#71717a">Or paste this link into your browser:</p>
       <p style="margin:0;font-size:13px;word-break:break-all"><a href="${escapeHtml(action.url)}" style="color:${escapeHtml(brand.accent)}">${escapeHtml(action.url)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <tr><td>
      <p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:.02em;color:${escapeHtml(brand.accent)}">${escapeHtml(brand.siteTitle)}</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(heading)}</h1>
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${escapeHtml(p)}</p>`).join("\n      ")}
      ${button}
      ${footer ? `<p style="margin:28px 0 0;font-size:13px;color:#71717a">${escapeHtml(footer)}</p>` : ""}
    </td></tr>
  </table>
</body></html>`;
}

function plain({ brand, heading, paragraphs, action, footer }: LayoutInput): string {
  return [
    brand.siteTitle,
    "",
    heading,
    "",
    ...paragraphs,
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    ...(footer ? ["", footer] : []),
    "",
  ].join("\n");
}

const body = (i: LayoutInput, subject: string): EmailBody => ({ subject, html: layout(i), text: plain(i) });

export function inviteEmail(brand: Brand, opts: { acceptUrl: string; role: string; invitedBy?: string | null }): EmailBody {
  const i: LayoutInput = {
    brand,
    heading: `You've been invited to ${brand.siteTitle}`,
    paragraphs: [
      `${opts.invitedBy ? `${opts.invitedBy} has invited you` : "You have been invited"} to join ${brand.siteTitle} as ${opts.role === "editor" || opts.role === "author" ? "an" : "a"} ${opts.role}.`,
      "Choose a password to activate your account. This invitation expires in 7 days.",
    ],
    action: { label: "Accept invitation", url: opts.acceptUrl },
    footer: "If you weren't expecting this, you can ignore this email.",
  };
  return body(i, `You've been invited to ${brand.siteTitle}`);
}

export function passwordResetEmail(brand: Brand, opts: { resetUrl: string }): EmailBody {
  const i: LayoutInput = {
    brand,
    heading: "Reset your password",
    paragraphs: [
      `Someone asked to reset the password for your ${brand.siteTitle} account.`,
      "This link works once and expires in one hour.",
    ],
    action: { label: "Reset password", url: opts.resetUrl },
    footer: "If you didn't ask for this, nothing has changed — you can ignore this email.",
  };
  return body(i, `Reset your ${brand.siteTitle} password`);
}

export function testEmail(brand: Brand): EmailBody {
  const i: LayoutInput = {
    brand,
    heading: "Email is working",
    paragraphs: [
      `This is a test message from ${brand.siteTitle}.`,
      "If it reached you, invites and password resets will too.",
    ],
  };
  return body(i, `${brand.siteTitle}: test email`);
}

export function pendingPostEmail(
  brand: Brand,
  opts: { title: string; authorName: string | null; reviewUrl: string },
): EmailBody {
  const i: LayoutInput = {
    brand,
    heading: "A post is waiting for review",
    paragraphs: [
      `“${opts.title}”${opts.authorName ? ` by ${opts.authorName}` : ""} has been submitted for review on ${brand.siteTitle}.`,
    ],
    action: { label: "Review it", url: opts.reviewUrl },
  };
  return body(i, `Pending review: ${opts.title}`);
}
