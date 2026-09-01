import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Actor, Post } from "@wove/sdk";
import { invites, passwordResets, sessions, users } from "../db/schema";
import { createSession, createUser, userActor, SESSION_COOKIE } from "../auth";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";
import { ROLE_SCOPES } from "./registry";
import { setEmailDriver, type EmailDriver, type EmailMessage } from "../email";
import { authLimiter } from "../ratelimit";
import { runRetention } from "../retention";

const h = makeHarness();

/** Records every message instead of sending it, and reports as a real (configured) driver. */
function fakeDriver() {
  const sent: (EmailMessage & { from: string })[] = [];
  const driver: EmailDriver = { name: "resend", async send(m) { sent.push(m); } };
  return { sent, restore: setEmailDriver(driver) };
}

let mail = fakeDriver();
beforeEach(() => {
  mail.restore();
  mail = fakeDriver();
  authLimiter.reset();
});
afterAll(() => {
  mail.restore();
  h.cleanup();
});

async function makeUser(email: string, role: "admin" | "editor" | "author" | "contributor"): Promise<Actor> {
  const existing = h.db.select().from(users).where(eq(users.email, email)).get();
  const row = existing ?? (await createUser(h.db, { email, name: email, password: "password1234", role }) as any);
  return userActor(row);
}

const post = (r: unknown) => r as Post;

describe("ROLE_SCOPES", () => {
  test("covers every role, admin is a wildcard", () => {
    expect(Object.keys(ROLE_SCOPES).sort()).toEqual(["admin", "author", "contributor", "editor"]);
    expect(ROLE_SCOPES.admin).toEqual(["*"]);
  });

  test("editor runs the site but not people or agents", () => {
    expect(ROLE_SCOPES.editor).toContain("content:publish");
    expect(ROLE_SCOPES.editor).toContain("audit:read");
    expect(ROLE_SCOPES.editor).not.toContain("agents:manage");
    expect(ROLE_SCOPES.editor).not.toContain("users:manage");
  });

  test("author may publish, contributor may not", () => {
    expect(ROLE_SCOPES.author).toContain("content:publish");
    expect(ROLE_SCOPES.contributor).not.toContain("content:publish");
    expect(ROLE_SCOPES.contributor).toContain("content:write");
    expect(ROLE_SCOPES.contributor).toContain("settings:read");
    expect(ROLE_SCOPES.contributor).not.toContain("settings:write");
  });

  test("post.publish is out of reach for a contributor", async () => {
    const contributor = await makeUser("scope-contrib@example.com", "contributor");
    const p = post(unwrap(await h.call(contributor, "post.create", { title: "Scope check" })));
    const r = await h.call(contributor, "post.publish", { id: p.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  test("nor through post.bulk", async () => {
    const contributor = await makeUser("scope-contrib@example.com", "contributor");
    const p = post(unwrap(await h.call(contributor, "post.create", { title: "Bulk check" })));
    const r = await h.call(contributor, "post.bulk", { ids: [p.id], action: "publish" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("content:publish");
  });
});

describe("post ownership", () => {
  test("an author cannot edit, delete or publish someone else's post", async () => {
    const a = await makeUser("author-a@example.com", "author");
    const b = await makeUser("author-b@example.com", "author");
    const p = post(unwrap(await h.call(a, "post.create", { title: "Mine alone" })));
    expect(p.authorId).toBe(a.id);

    for (const [tool, input] of [
      ["post.update", { id: p.id, title: "Hijacked" }],
      ["post.delete", { id: p.id }],
      ["post.publish", { id: p.id }],
    ] as const) {
      const r = await h.call(b, tool, input);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(403);
        expect(r.error.message).toContain("your own posts");
      }
    }
  });

  test("an author may edit and publish their own", async () => {
    const a = await makeUser("author-a@example.com", "author");
    const p = post(unwrap(await h.call(a, "post.create", { title: "My draft" })));
    expect(post(unwrap(await h.call(a, "post.update", { id: p.id, title: "My draft, revised" }))).title)
      .toBe("My draft, revised");
    expect(post(unwrap(await h.call(a, "post.publish", { id: p.id }))).status).toBe("published");
  });

  test("an editor may edit anyone's", async () => {
    const a = await makeUser("author-a@example.com", "author");
    const editor = await makeUser("own-editor@example.com", "editor");
    const p = post(unwrap(await h.call(a, "post.create", { title: "Needs a subeditor" })));
    const updated = post(unwrap(await h.call(editor, "post.update", { id: p.id, title: "Subedited" })));
    expect(updated.title).toBe("Subedited");
    expect(updated.authorId).toBe(a.id);
  });

  test("post.bulk silently skips rows an author does not own", async () => {
    const a = await makeUser("author-a@example.com", "author");
    const b = await makeUser("author-b@example.com", "author");
    const mine = post(unwrap(await h.call(a, "post.create", { title: "Bulk mine" })));
    const theirs = post(unwrap(await h.call(b, "post.create", { title: "Bulk theirs" })));
    const r = unwrap<{ affected: number }>(await h.call(a, "post.bulk", { ids: [mine.id, theirs.id], action: "trash" }));
    expect(r.affected).toBe(1);
    expect(post(unwrap(await h.call(ADMIN, "post.get", { id: theirs.id }))).status).toBe("draft");
  });

  test("reads stay site-wide", async () => {
    const contributor = await makeUser("reader@example.com", "contributor");
    const items = unwrap<{ items: Post[] }>(await h.call(contributor, "post.list", {})).items;
    expect(items.some((p) => p.authorId !== contributor.id)).toBe(true);
  });
});

describe("pending review workflow", () => {
  test("a contributor cannot create or update straight to published", async () => {
    const contributor = await makeUser("pending-contrib@example.com", "contributor");
    const create = await h.call(contributor, "post.create", { title: "Too eager", status: "published" });
    expect(create.ok).toBe(false);
    if (!create.ok) {
      expect(create.status).toBe(400);
      expect(create.error.message).toContain("pending");
    }
    const p = post(unwrap(await h.call(contributor, "post.create", { title: "Patient" })));
    const update = await h.call(contributor, "post.update", { id: p.id, status: "scheduled" });
    expect(update.ok).toBe(false);
    if (!update.ok) expect(update.status).toBe(400);
  });

  test("entering pending emits post.pending and mails the reviewers", async () => {
    const admin = await makeUser("reviewer-admin@example.com", "admin");
    await makeUser("reviewer-editor@example.com", "editor");
    const contributor = await makeUser("submitter@example.com", "contributor");

    const seen: Post[] = [];
    const off = h.hooks.on("post.pending", ({ post: p }) => void seen.push(p));

    const p = post(unwrap(await h.call(contributor, "post.create", { title: "Please review me", status: "pending" })));
    expect(p.status).toBe("pending");
    await Bun.sleep(5);
    expect(seen.map((x) => x.id)).toEqual([p.id]);
    const to = mail.sent.map((m) => m.to);
    expect(to).toContain("reviewer-admin@example.com");
    expect(to).toContain("reviewer-editor@example.com");
    expect(mail.sent[0]!.subject).toContain("Please review me");

    // Saving again while already pending must not re-notify.
    mail.sent.length = 0;
    unwrap(await h.call(contributor, "post.update", { id: p.id, title: "Please review me (typo fixed)" }));
    await Bun.sleep(5);
    expect(mail.sent).toEqual([]);
    off();

    // An admin can then take it live.
    expect(post(unwrap(await h.call(admin, "post.publish", { id: p.id }))).status).toBe("published");
  });
});

describe("user.invite → accept → sign in", () => {
  test("the whole loop, plus duplicate and expiry rejections", async () => {
    const invited = "newcomer@example.com";
    const out = unwrap<{ acceptUrl: string; emailSent: boolean; invite: { id: string; role: string } }>(
      await h.call(ADMIN, "user.invite", { email: invited, role: "author" }),
    );
    expect(out.emailSent).toBe(true);
    expect(out.invite.role).toBe("author");
    expect(mail.sent.at(-1)!.to).toBe(invited);
    const token = new URL(out.acceptUrl).searchParams.get("token")!;
    expect(token.startsWith("wove_inv_")).toBe(true);
    // Only the hash is stored.
    expect(h.db.select().from(invites).all().some((r) => r.tokenHash === token)).toBe(false);

    // A second invite to the same address is a conflict, not a second token.
    const dup = await h.call(ADMIN, "user.invite", { email: invited, role: "editor" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.status).toBe(409);

    expect(unwrap<unknown[]>(await h.call(ADMIN, "user.invites", {})).length).toBeGreaterThan(0);

    const accept = await h.app.fetch(new Request("http://x/api/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name: "New Comer", password: "newcomer1234" }),
    }));
    expect(accept.status).toBe(201);
    const created = await accept.json() as { user: { role: string; email: string } };
    expect(created.user.role).toBe("author");
    expect(accept.headers.get("set-cookie")).toContain(SESSION_COOKIE);

    // The token is spent.
    const replay = await h.app.fetch(new Request("http://x/api/auth/accept-invite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name: "Impostor", password: "impostor1234" }),
    }));
    expect(replay.status).toBe(400);

    const login = await h.app.fetch(new Request("http://x/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: invited, password: "newcomer1234" }),
    }));
    expect(login.status).toBe(200);
    expect((await login.json() as any).actor.scopes).toEqual(ROLE_SCOPES.author);
  });

  test("an expired invite is rejected", async () => {
    const out = unwrap<{ acceptUrl: string; invite: { id: string } }>(
      await h.call(ADMIN, "user.invite", { email: "slowpoke@example.com" }),
    );
    const token = new URL(out.acceptUrl).searchParams.get("token")!;
    h.db.update(invites).set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(invites.id, out.invite.id)).run();
    const res = await h.app.fetch(new Request("http://x/api/auth/accept-invite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name: "Slow Poke", password: "slowpoke1234" }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json() as any).message).toContain("expired");
  });

  test("inviting an existing account is a 409, and revoking clears the row", async () => {
    await makeUser("already@example.com", "editor");
    const r = await h.call(ADMIN, "user.invite", { email: "already@example.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);

    const out = unwrap<{ invite: { id: string } }>(await h.call(ADMIN, "user.invite", { email: "revoke-me@example.com" }));
    unwrap(await h.call(ADMIN, "user.revokeInvite", { id: out.invite.id }));
    expect(h.db.select().from(invites).where(eq(invites.id, out.invite.id)).get()).toBeUndefined();
  });
});

describe("forgot / reset", () => {
  const postJson = (path: string, body: unknown) =>
    h.app.fetch(new Request(`http://x${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }));

  test("forgot always answers 200 and only mails real accounts", async () => {
    const actor = await makeUser("forgetful@example.com", "editor");
    expect(actor.id).toBeTruthy();

    const miss = await postJson("/api/auth/forgot", { email: "nobody@example.com" });
    expect(miss.status).toBe(200);
    expect(await miss.json()).toEqual({ ok: true });
    await Bun.sleep(5);
    expect(mail.sent).toEqual([]);

    const hit = await postJson("/api/auth/forgot", { email: "forgetful@example.com" });
    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ ok: true });
    await Bun.sleep(5);
    expect(mail.sent.at(-1)!.to).toBe("forgetful@example.com");
    expect(mail.sent.at(-1)!.text).toContain("/reset-password?token=");
  });

  test("reset sets the password and signs every session out", async () => {
    const actor = await makeUser("resetter@example.com", "editor");
    const userId = actor.id!;
    createSession(h.db, userId);
    createSession(h.db, userId);
    expect(h.db.select().from(sessions).where(eq(sessions.userId, userId)).all().length).toBe(2);

    await postJson("/api/auth/forgot", { email: "resetter@example.com" });
    await Bun.sleep(5);
    const token = new URL(mail.sent.at(-1)!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

    const res = await postJson("/api/auth/reset", { token, password: "brandnew1234" });
    expect(res.status).toBe(200);
    expect(h.db.select().from(sessions).where(eq(sessions.userId, userId)).all().length).toBe(0);

    const login = await postJson("/api/auth/login", { email: "resetter@example.com", password: "brandnew1234" });
    expect(login.status).toBe(200);

    // Single use.
    expect((await postJson("/api/auth/reset", { token, password: "another1234" })).status).toBe(400);
  });

  test("retention purges spent tokens once they are old enough", async () => {
    const actor = await makeUser("sweeper@example.com", "editor");
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    h.db.insert(passwordResets).values({
      id: "pr_old", tokenHash: "x", userId: actor.id!, expiresAt: old, usedAt: old, createdAt: old,
    }).run();
    h.db.insert(invites).values({
      id: "inv_old", tokenHash: "y", email: "gone@example.com", role: "editor",
      invitedBy: null, expiresAt: old, acceptedAt: null, createdAt: old,
    }).run();
    expect(runRetention(h.db, {}).tokens).toBeGreaterThanOrEqual(2);
    expect(h.db.select().from(passwordResets).where(eq(passwordResets.id, "pr_old")).get()).toBeUndefined();
    expect(h.db.select().from(invites).where(eq(invites.id, "inv_old")).get()).toBeUndefined();
  });
});

describe("user administration", () => {
  test("the last admin can be neither demoted nor removed", async () => {
    const admin = await makeUser("solo-admin@example.com", "admin");
    const onlyAdmin: Actor = { ...admin, scopes: ["*"] };
    // Every other admin row in this db first.
    for (const r of h.db.select().from(users).where(eq(users.role, "admin")).all()) {
      if (r.id !== admin.id) h.db.update(users).set({ role: "editor" }).where(eq(users.id, r.id)).run();
    }

    const demote = await h.call(onlyAdmin, "user.updateRole", { id: admin.id!, role: "editor" });
    expect(demote.ok).toBe(false);
    if (!demote.ok) expect(demote.status).toBe(409);

    const other = await makeUser("victim@example.com", "editor");
    const removeSelf = await h.call(onlyAdmin, "user.remove", { id: admin.id! });
    expect(removeSelf.ok).toBe(false);
    if (!removeSelf.ok) expect(removeSelf.error.message).toContain("your own account");

    const removeLastAdmin = await h.call({ ...ADMIN, id: other.id }, "user.remove", { id: admin.id! });
    expect(removeLastAdmin.ok).toBe(false);
    if (!removeLastAdmin.ok) expect(removeLastAdmin.status).toBe(409);

    // With a second admin, both are allowed again.
    unwrap(await h.call(onlyAdmin, "user.updateRole", { id: other.id!, role: "admin" }));
    unwrap(await h.call(onlyAdmin, "user.updateRole", { id: admin.id!, role: "editor" }));
    unwrap(await h.call(onlyAdmin, "user.updateRole", { id: admin.id!, role: "admin" }));
  });

  test("removing a user keeps their posts attributed", async () => {
    const doomed = await makeUser("doomed@example.com", "author");
    const p = post(unwrap(await h.call(doomed, "post.create", { title: "Outlives its author" })));
    createSession(h.db, doomed.id!);
    unwrap(await h.call(ADMIN, "user.remove", { id: doomed.id! }));
    expect(h.db.select().from(sessions).where(eq(sessions.userId, doomed.id!)).all()).toEqual([]);
    expect(post(unwrap(await h.call(ADMIN, "post.get", { id: p.id }))).authorId).toBe(doomed.id);
  });

  test("user.list is out of reach for a non-admin", async () => {
    const editor = await makeUser("nosy@example.com", "editor");
    const r = await h.call(editor, "user.list", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

describe("user.updateProfile", () => {
  test("a password change needs the current password and clears other sessions", async () => {
    const actor = await makeUser("profile@example.com", "author");
    const keep = createSession(h.db, actor.id!);
    createSession(h.db, actor.id!);

    const wrong = await h.call(actor, "user.updateProfile", { password: "newpass1234", currentPassword: "nope" });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.status).toBe(403);

    const missing = await h.call(actor, "user.updateProfile", { password: "newpass1234" });
    expect(missing.ok).toBe(false);

    const renamed = unwrap<{ name: string }>(await h.call(actor, "user.updateProfile", { name: "Renamed" }));
    expect(renamed.name).toBe("Renamed");
    expect(h.db.select().from(sessions).where(eq(sessions.userId, actor.id!)).all().length).toBe(2);

    const ok = await dispatchWithSession(actor, keep.id, { password: "newpass1234", currentPassword: "password1234" });
    expect(ok.ok).toBe(true);
    const left = h.db.select().from(sessions).where(eq(sessions.userId, actor.id!)).all();
    expect(left.map((s) => s.id)).toEqual([keep.id]);
  });
});

async function dispatchWithSession(actor: Actor, sessionId: string, input: unknown) {
  const { dispatch } = await import("./registry");
  return dispatch("user.updateProfile", input, {
    actor, channel: "ui", db: h.db, hooks: h.hooks, registry: h.registry, sessionId,
  }, h.registry);
}
