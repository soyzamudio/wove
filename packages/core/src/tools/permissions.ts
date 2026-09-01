/**
 * Who may touch which post.
 *
 * Scopes answer "what kind of action is this actor allowed to perform at all"; this module
 * answers the second question WordPress-shaped roles need: *whose* content. Authors and
 * contributors are confined to rows they wrote. Agents are deliberately exempt — an agent's
 * key already carries an explicit scope grant, and it has no author identity to compare.
 */
import { eq } from "drizzle-orm";
import type { UserRole } from "@wove/sdk";
import { users } from "../db/schema";
import { UNRESTRICTED_ROLES, ToolError, type Ctx } from "./registry";

/** The caller's role, when the caller is a user that still exists. */
export function actorRole(ctx: Ctx): UserRole | null {
  if (ctx.actor.kind !== "user" || !ctx.actor.id) return null;
  const row = ctx.db.select({ role: users.role }).from(users).where(eq(users.id, ctx.actor.id)).get();
  return (row?.role as UserRole | undefined) ?? null;
}

/**
 * True when the caller may only act on their own posts. Users with a role we cannot read
 * (test actors, deleted rows) fall back to their scopes: `*` is unrestricted, and so is
 * anything holding `settings:write`, which only admin/editor roles grant.
 */
export function isOwnerScoped(ctx: Ctx): boolean {
  if (ctx.actor.kind !== "user") return false;
  const role = actorRole(ctx);
  if (role) return !UNRESTRICTED_ROLES.includes(role);
  return !(ctx.actor.scopes.includes("*") || ctx.actor.scopes.includes("settings:write"));
}

export function ownsPost(ctx: Ctx, post: { authorId: string | null }): boolean {
  return !!ctx.actor.id && post.authorId === ctx.actor.id;
}

/** Throws 403 unless the caller wrote the post (or has site-wide reach). */
export function assertCanEditPost(ctx: Ctx, post: { authorId: string | null }, verb = "edit"): void {
  if (!isOwnerScoped(ctx)) return;
  if (ownsPost(ctx, post)) return;
  throw new ToolError("forbidden", `You can only ${verb} your own posts`);
}

/** Statuses a contributor may write. Publishing is a separate, reviewed step. */
export const CONTRIBUTOR_STATUSES = ["draft", "pending", "trashed"] as const;

/**
 * Contributors submit for review instead of publishing. This is a 400 rather than a 403
 * because the request is well-formed but asks for a status the role can never set — the
 * message names the statuses that would work.
 */
export function assertStatusAllowed(ctx: Ctx, status: string | undefined): void {
  if (!status) return;
  if (actorRole(ctx) !== "contributor") return;
  if ((CONTRIBUTOR_STATUSES as readonly string[]).includes(status)) return;
  throw new ToolError(
    "validation_error",
    `Contributors cannot set status "${status}" — save as "draft" or submit for review with "pending".`,
    { allowed: ["draft", "pending"] },
  );
}
