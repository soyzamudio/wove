import { and, eq, isNull } from "drizzle-orm";
import type { Actor, Scope, UserRole } from "@wove/sdk";
import type { DB } from "./db";
import { agents, sessions, users } from "./db/schema";
import { newId, nowIso, sha256 } from "./ids";
import { ROLE_SCOPES } from "./tools/registry";
import { secureCookies, type Env } from "./env";

export const SESSION_COOKIE = "wove_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export const ANON: Actor = { kind: "anon", id: null, scopes: [] };

export interface Resolved {
  actor: Actor;
  user?: typeof users.$inferSelect;
  agentId?: string;
}

export const hashPassword = (pw: string) => Bun.password.hash(pw);
export const verifyPassword = (pw: string, hash: string) => Bun.password.verify(pw, hash);

export function userActor(u: { id: string; role: UserRole }): Actor {
  return { kind: "user", id: u.id, scopes: ROLE_SCOPES[u.role] };
}

function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Resolve the caller of a raw Request into an Actor. Never throws; falls back to anon. */
export function resolveActor(db: DB, req: Request): Resolved {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const key = auth.slice(7).trim();
    if (key.startsWith("wove_")) {
      const row = db.select().from(agents)
        .where(and(eq(agents.keyHash, sha256(key)), isNull(agents.revokedAt)))
        .get();
      if (row) {
        db.update(agents).set({ lastUsedAt: nowIso() }).where(eq(agents.id, row.id)).run();
        return { actor: { kind: "agent", id: row.id, scopes: row.scopes as Scope[] }, agentId: row.id };
      }
    }
    return { actor: ANON };
  }

  const sid = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (sid) {
    const row = db.select({ session: sessions, user: users })
      .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sid)).get();
    if (row) {
      if (new Date(row.session.expiresAt).getTime() < Date.now()) {
        db.delete(sessions).where(eq(sessions.id, sid)).run();
        return { actor: ANON };
      }
      return { actor: userActor(row.user), user: row.user };
    }
  }
  return { actor: ANON };
}

export function createSession(db: DB, userId: string): { id: string; expiresAt: string } {
  const id = newId(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.insert(sessions).values({ id, userId, createdAt: nowIso(), expiresAt }).run();
  return { id, expiresAt };
}

export function destroySession(db: DB, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

/**
 * `SameSite=Lax` (not Strict) so a link from the public site into /admin still arrives
 * signed in; `Secure` whenever the deployment is actually served over https, which browsers
 * require before they will store a `SameSite=None`-adjacent cookie at all.
 */
export function sessionCookie(id: string, maxAgeSec = SESSION_TTL_MS / 1000, env: Env = process.env): string {
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeSec)}${cookieSuffix(env)}`;
}

export const clearedCookie = (env: Env = process.env) =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSuffix(env)}`;

const cookieSuffix = (env: Env) => (secureCookies(env) ? "; Secure" : "");

export function readSessionId(req: Request): string | undefined {
  return parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
}

export async function createUser(
  db: DB, input: { email: string; name: string; password: string; role?: UserRole },
) {
  const row = {
    id: newId(),
    email: input.email.toLowerCase().trim(),
    name: input.name,
    passwordHash: await hashPassword(input.password),
    role: input.role ?? "editor",
    createdAt: nowIso(),
  };
  db.insert(users).values(row).run();
  return row;
}

export function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt };
}

// ---------------------------------------------------------------- invite & reset tokens

/** 7 days: long enough to survive a weekend, short enough that a leaked mailbox ages out. */
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
/** 1 hour, the usual budget for a password-reset link. */
export const RESET_TTL_MS = 1000 * 60 * 60;

/**
 * Tokens are stored only as a sha256 hash, exactly like agent API keys: a database dump
 * never yields a working invite or reset link.
 */
export const newInviteToken = () => `wove_inv_${newId(40)}`;
export const newResetToken = () => `wove_rst_${newId(40)}`;
export const tokenHash = sha256;

/** Sign every session of a user out. `exceptId` keeps the caller's own session alive. */
export function deleteUserSessions(db: DB, userId: string, exceptId?: string): number {
  const rows = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).all();
  let n = 0;
  for (const r of rows) {
    if (r.id === exceptId) continue;
    db.delete(sessions).where(eq(sessions.id, r.id)).run();
    n++;
  }
  return n;
}
