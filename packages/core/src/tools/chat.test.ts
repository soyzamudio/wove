import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import type { Actor } from "@wove/sdk";
import type { AiChatEvent } from "../ai/provider";
import { openSession } from "../ai/run";
import { runChat } from "../chat/loop";
import { auditLog, posts } from "../db/schema";
import { ADMIN, configureFakeAi, makeHarness, scriptChat, unwrap } from "../test-helpers";

const h = makeHarness();
let restore = () => {};

/** The same person, before and after losing the publish scope. */
const PUBLISHER: Actor = { kind: "user", id: "u_nopub", scopes: ["content:read", "content:write", "content:publish", "ai:use"] };
const NO_PUBLISH: Actor = { kind: "user", id: "u_nopub", scopes: ["content:read", "content:write", "ai:use"] };
const OTHER: Actor = { kind: "user", id: "u_other", scopes: ["*"] };

beforeEach(() => {
  configureFakeAi(h.db);
  h.db.delete(posts).run();
  h.db.delete(auditLog).run();
});
afterEach(() => restore());

const use = (id: string, name: string, input: unknown): AiChatEvent => ({ type: "toolUse", id, name, input });

/** Run one scripted turn and return { threadId, messageId } of the assistant reply. */
async function propose(actor: Actor, uses: AiChatEvent[]) {
  restore = scriptChat([uses, [{ type: "token", text: "Approve when ready." }]]).restore;
  const ctx = h.ctx(actor, "chat");
  const session = await openSession(ctx);
  let threadId = "";
  let messageId = "";
  for await (const ev of runChat(ctx, session, { message: "do it", baseUrl: "http://x", registry: h.registry })) {
    if (ev.type === "thread") threadId = ev.threadId;
    if (ev.type === "message") messageId = ev.message.id;
  }
  return { threadId, messageId };
}

describe("chat.apply", () => {
  test("applies approved calls in plan order and rejects the rest", async () => {
    const { threadId, messageId } = await propose(ADMIN, [
      use("a", "post.create", { type: "post", title: "First" }),
      use("b", "post.create", { type: "post", title: "Second" }),
      use("c", "post.create", { type: "post", title: "Skipped" }),
    ]);

    const msg: any = unwrap(await h.call(ADMIN, "chat.apply", { threadId, messageId, approve: ["a", "b"] }));
    expect(msg.toolCalls.map((c: any) => c.status)).toEqual(["applied", "applied", "rejected"]);
    expect(msg.planPending).toBe(false);

    const titles = h.db.select().from(posts).all().map((p) => p.title);
    expect(titles).toEqual(["First", "Second"]);

    const audits = h.db.select().from(auditLog).where(and(eq(auditLog.tool, "post.create"), eq(auditLog.channel, "chat"))).all();
    expect(audits.length).toBe(2);
  });

  test("a failing call does not abandon the rest of the plan", async () => {
    const { threadId, messageId } = await propose(ADMIN, [
      use("a", "post.update", { id: "p_missing", title: "Nope" }),
      use("b", "post.create", { type: "post", title: "Survivor" }),
    ]);
    const msg: any = unwrap(await h.call(ADMIN, "chat.apply", { threadId, messageId, approve: ["a", "b"] }));
    expect(msg.toolCalls[0].status).toBe("failed");
    expect(typeof msg.toolCalls[0].result).toBe("string");
    expect(msg.toolCalls[1].status).toBe("applied");
  });

  test("scopes are enforced at apply time, not at proposal time", async () => {
    const post: any = unwrap(await h.call(ADMIN, "post.create", { type: "post", title: "Pending" }));
    const { threadId, messageId } = await propose(PUBLISHER, [use("p", "post.publish", { id: post.id })]);

    const msg: any = unwrap(await h.call(NO_PUBLISH, "chat.apply", { threadId, messageId, approve: ["p"] }));
    expect(msg.toolCalls[0].status).toBe("failed");
    expect(String(msg.toolCalls[0].result)).toContain("content:publish");
    expect(h.db.select().from(posts).all()[0]!.status).not.toBe("published");
  });
});

describe("chat.discard", () => {
  test("rejects every proposal and clears the pending plan", async () => {
    const { threadId, messageId } = await propose(ADMIN, [use("a", "post.create", { type: "post", title: "Nope" })]);
    const msg: any = unwrap(await h.call(ADMIN, "chat.discard", { threadId, messageId }));
    expect(msg.toolCalls[0].status).toBe("rejected");
    expect(msg.planPending).toBe(false);
    expect(h.db.select().from(posts).all().length).toBe(0);
  });
});

describe("thread scoping", () => {
  test("threads are private to the actor that started them", async () => {
    const { threadId, messageId } = await propose(ADMIN, [use("a", "post.create", { type: "post", title: "Mine" })]);

    expect((unwrap<any[]>(await h.call(ADMIN, "chat.threads"))).length).toBeGreaterThan(0);
    expect(unwrap<any[]>(await h.call(OTHER, "chat.threads"))).toEqual([]);

    for (const call of [
      h.call(OTHER, "chat.get", { id: threadId }),
      h.call(OTHER, "chat.apply", { threadId, messageId, approve: ["a"] }),
      h.call(OTHER, "chat.delete", { id: threadId }),
    ]) {
      const r = await call;
      expect(r.ok).toBe(false);
      expect((r as any).error.code).toBe("not_found");
    }

    expect(unwrap<{ ok: true }>(await h.call(ADMIN, "chat.delete", { id: threadId }))).toEqual({ ok: true });
    expect((await h.call(ADMIN, "chat.get", { id: threadId })).ok).toBe(false);
  });
});
