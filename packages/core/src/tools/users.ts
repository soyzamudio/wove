/**
 * People and the mail that reaches them.
 *
 * Invites and password resets follow the same rule as agent API keys: the token is shown
 * once and stored only as a sha256 hash. `user.invite` therefore always returns the accept
 * URL — with the console driver (the default) that link is the only way in, and even with a
 * real driver an admin often wants to paste it into chat.
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions, type UserRole } from "@wove/sdk";
import { invites, sessions, users } from "../db/schema";
import { newId, nowIso, sha256 } from "../ids";
import { deleteUserSessions, hashPassword, INVITE_TTL_MS, newInviteToken, verifyPassword } from "../auth";
import { adminBaseUrl, emailFrom } from "../env";
import { brandFor, emailStatus, inviteEmail, resolveDriver, sendEmail, testEmail } from "../email";
import { conflict, defineTool, notFound, ToolError, type Ctx } from "./registry";

const D = ToolDescriptions;

const toUser = (r: typeof users.$inferSelect) => ({
  id: r.id, email: r.email, name: r.name, role: r.role as UserRole, createdAt: r.createdAt,
});

const toInvite = (r: typeof invites.$inferSelect) => ({
  id: r.id, email: r.email, role: r.role as UserRole,
  invitedBy: r.invitedBy ?? null, expiresAt: r.expiresAt, createdAt: r.createdAt,
});

export const acceptInviteUrl = (token: string) =>
  `${adminBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;

export const resetPasswordUrl = (token: string) =>
  `${adminBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

/** Admins are the only role that can grant roles; losing the last one locks everyone out. */
function adminCount(ctx: Ctx, excludingId?: string): number {
  return ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .all()
    .filter((r) => r.id !== excludingId).length;
}

function getUser(ctx: Ctx, id: string) {
  const row = ctx.db.select().from(users).where(eq(users.id, id)).get();
  if (!row) throw notFound(`No user with id "${id}"`);
  return row;
}

export const userList = defineTool({
  name: "user.list",
  description: D["user.list"],
  input: ToolCatalog["user.list"].input,
  output: ToolCatalog["user.list"].output,
  scopes: ToolCatalog["user.list"].scopes,
  mutation: false,
  handler: (ctx) => ctx.db.select().from(users).orderBy(asc(users.createdAt)).all().map(toUser),
});

export const userInvite = defineTool({
  name: "user.invite",
  description: D["user.invite"],
  input: ToolCatalog["user.invite"].input,
  output: ToolCatalog["user.invite"].output,
  scopes: ToolCatalog["user.invite"].scopes,
  handler: async (ctx, input) => {
    const email = input.email.toLowerCase().trim();
    if (ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
      throw conflict(`${email} already has an account`);
    }
    const now = nowIso();
    const pending = ctx.db
      .select()
      .from(invites)
      .where(and(eq(invites.email, email), isNull(invites.acceptedAt)))
      .all()
      .find((r) => r.expiresAt > now);
    if (pending) throw conflict(`${email} already has a pending invite`, { inviteId: pending.id });

    const token = newInviteToken();
    const row = {
      id: newId(),
      tokenHash: sha256(token),
      email,
      role: input.role,
      invitedBy: ctx.actor.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      acceptedAt: null,
      createdAt: now,
    };
    ctx.db.insert(invites).values(row).run();

    const acceptUrl = acceptInviteUrl(token);
    const inviter = ctx.actor.id
      ? ctx.db.select({ name: users.name }).from(users).where(eq(users.id, ctx.actor.id)).get()?.name ?? null
      : null;
    const body = inviteEmail(brandFor(ctx.db), { acceptUrl, role: input.role, invitedBy: inviter });
    // The invite exists either way: a mail failure must not strand the row, and the caller
    // still gets a working link back.
    let emailSent = resolveDriver().name !== "console";
    try {
      await sendEmail({ to: email, ...body });
    } catch (e) {
      console.error("[user.invite] email failed:", (e as Error)?.message);
      emailSent = false;
    }
    return { invite: toInvite(row as typeof invites.$inferSelect), acceptUrl, emailSent };
  },
});

export const userInvites = defineTool({
  name: "user.invites",
  description: D["user.invites"],
  input: ToolCatalog["user.invites"].input,
  output: ToolCatalog["user.invites"].output,
  scopes: ToolCatalog["user.invites"].scopes,
  mutation: false,
  handler: (ctx) =>
    ctx.db.select().from(invites).where(isNull(invites.acceptedAt)).orderBy(desc(invites.createdAt)).all().map(toInvite),
});

export const userRevokeInvite = defineTool({
  name: "user.revokeInvite",
  description: D["user.revokeInvite"],
  input: ToolCatalog["user.revokeInvite"].input,
  output: ToolCatalog["user.revokeInvite"].output,
  scopes: ToolCatalog["user.revokeInvite"].scopes,
  handler: (ctx, input) => {
    const row = ctx.db.select().from(invites).where(eq(invites.id, input.id)).get();
    if (!row || row.acceptedAt) throw notFound(`No pending invite with id "${input.id}"`);
    ctx.db.delete(invites).where(eq(invites.id, input.id)).run();
    return { ok: true as const };
  },
});

export const userUpdateRole = defineTool({
  name: "user.updateRole",
  description: D["user.updateRole"],
  input: ToolCatalog["user.updateRole"].input,
  output: ToolCatalog["user.updateRole"].output,
  scopes: ToolCatalog["user.updateRole"].scopes,
  handler: (ctx, input) => {
    const row = getUser(ctx, input.id);
    if (row.role === "admin" && input.role !== "admin" && adminCount(ctx, row.id) === 0) {
      throw conflict("This is the last admin — promote someone else first");
    }
    ctx.db.update(users).set({ role: input.role }).where(eq(users.id, row.id)).run();
    // Scopes are baked into the session's actor at resolve time, so the change takes effect
    // on the next request without touching sessions.
    return toUser({ ...row, role: input.role });
  },
});

export const userRemove = defineTool({
  name: "user.remove",
  description: D["user.remove"],
  input: ToolCatalog["user.remove"].input,
  output: ToolCatalog["user.remove"].output,
  scopes: ToolCatalog["user.remove"].scopes,
  handler: (ctx, input) => {
    const row = getUser(ctx, input.id);
    if (ctx.actor.id === row.id) throw conflict("You cannot remove your own account");
    if (row.role === "admin" && adminCount(ctx, row.id) === 0) {
      throw conflict("This is the last admin — promote someone else first");
    }
    // Posts keep their `authorId`: history stays attributed even though the account is gone.
    ctx.db.delete(sessions).where(eq(sessions.userId, row.id)).run();
    ctx.db.delete(users).where(eq(users.id, row.id)).run();
    return { ok: true as const };
  },
});

export const userUpdateProfile = defineTool({
  name: "user.updateProfile",
  description: D["user.updateProfile"],
  input: ToolCatalog["user.updateProfile"].input,
  output: ToolCatalog["user.updateProfile"].output,
  scopes: ToolCatalog["user.updateProfile"].scopes,
  handler: async (ctx, input) => {
    if (ctx.actor.kind !== "user" || !ctx.actor.id) {
      throw new ToolError("forbidden", "Only a signed-in user has a profile to update");
    }
    const row = getUser(ctx, ctx.actor.id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.password !== undefined) {
      if (!input.currentPassword || !(await verifyPassword(input.currentPassword, row.passwordHash))) {
        throw new ToolError("forbidden", "Current password is incorrect");
      }
      patch.passwordHash = await hashPassword(input.password);
    }
    if (Object.keys(patch).length) {
      ctx.db.update(users).set(patch).where(eq(users.id, row.id)).run();
    }
    // A password change signs out everywhere else, but keeps the session doing the changing.
    if (patch.passwordHash) deleteUserSessions(ctx.db, row.id, ctx.sessionId);
    return toUser({ ...row, ...(patch as Partial<typeof row>) });
  },
});

// ---------------------------------------------------------------- email

export const emailStatusTool = defineTool({
  name: "email.status",
  description: D["email.status"],
  input: ToolCatalog["email.status"].input,
  output: ToolCatalog["email.status"].output,
  scopes: ToolCatalog["email.status"].scopes,
  mutation: false,
  handler: () => emailStatus(),
});

export const emailTest = defineTool({
  name: "email.test",
  description: D["email.test"],
  input: ToolCatalog["email.test"].input,
  output: ToolCatalog["email.test"].output,
  scopes: ToolCatalog["email.test"].scopes,
  handler: async (ctx, input) => {
    try {
      await sendEmail({ to: input.to, ...testEmail(brandFor(ctx.db)) });
    } catch (e) {
      throw new ToolError("internal_error", `Could not send from ${emailFrom()}: ${(e as Error)?.message}`);
    }
    return { ok: true as const };
  },
});

export const userTools = [
  userList, userInvite, userInvites, userRevokeInvite, userUpdateRole, userRemove, userUpdateProfile,
  emailStatusTool, emailTest,
];
