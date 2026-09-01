import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import type { AiChatEvent } from "../ai/provider";
import { ADMIN, EDITOR, configureFakeAi, makeHarness, scriptChat, unwrap } from "../test-helpers";
import { openSession } from "../ai/run";
import { auditLog, aiUsage, posts } from "../db/schema";
import { sanitizeToolName, ToolNameMap } from "../ai/toolnames";
import { unifiedDiff } from "./diff";
import { exposedChatTools, isExposed, runChat, type ChatStreamEvent } from "./loop";

const h = makeHarness();
let restore = () => {};

beforeEach(() => {
  configureFakeAi(h.db);
  h.db.delete(posts).run();
  h.db.delete(auditLog).run();
  h.db.delete(aiUsage).run();
});
afterEach(() => restore());

const use = (id: string, name: string, input: unknown): AiChatEvent => ({ type: "toolUse", id, name, input });

async function chat(actor = ADMIN, message = "hi", threadId?: string) {
  const ctx = h.ctx(actor, "chat");
  const session = await openSession(ctx);
  const events: ChatStreamEvent[] = [];
  for await (const ev of runChat(ctx, session, { threadId, message, baseUrl: "http://localhost:4000", registry: h.registry })) {
    events.push(ev);
  }
  return events;
}

describe("tool exposure", () => {
  test("hides chat/agent/import/export/audit plumbing and trash nukes", () => {
    for (const n of ["chat.get", "agent.create", "import.wordpress", "export.site", "ai.usage", "audit.list", "post.emptyTrash"]) {
      expect(isExposed(n)).toBe(false);
    }
    expect(isExposed("post.create")).toBe(true);
  });

  test("post.delete is offered without the permanent flag", () => {
    const del = exposedChatTools(h.ctx(ADMIN, "chat"), h.registry).find((t) => t.tool.name === "post.delete")!;
    expect(Object.keys((del.def.parameters as any).properties)).toEqual(["id"]);
  });

  test("scopes filter the list", () => {
    const editor = exposedChatTools(h.ctx(EDITOR, "chat"), h.registry).map((t) => t.tool.name);
    expect(editor).toContain("post.update");
    expect(editor).not.toContain("agent.create");
  });
});

describe("tool name sanitisation", () => {
  test("dots become underscores and map back", () => {
    expect(sanitizeToolName("post.create")).toBe("post_create");
    const map = new ToolNameMap(["post.create", "block.catalog"]);
    expect(map.toWire("post.create")).toBe("post_create");
    expect(map.fromWire("post_create")).toBe("post.create");
    expect(map.fromWire("block_catalog")).toBe("block.catalog");
    expect(map.fromWire("who_knows")).toBe("who_knows");
  });
});

describe("runChat", () => {
  test("executes reads immediately and feeds the result back", async () => {
    unwrap(await h.call(ADMIN, "post.create", { type: "post", title: "Hello world", content: "one\ntwo" }));
    restore = scriptChat([[use("t1", "post.list", { limit: 5 })], [{ type: "token", text: "You have 1 post." }]]).restore;

    const events = await chat();
    const call = events.find((e) => e.type === "tool_call") as any;
    expect(call.call.kind).toBe("read");
    expect(call.call.status).toBe("executed");
    expect((call.call.result as any).items.length).toBe(1);

    const msg = events.find((e) => e.type === "message") as any;
    expect(msg.message.content).toBe("You have 1 post.");
    expect(msg.message.planPending).toBe(false);
  });

  test("mutations are proposed, never executed", async () => {
    restore = scriptChat([[use("m1", "post.create", { type: "post", title: "Draft me" })], [{ type: "token", text: "Ready when you are." }]]).restore;

    const events = await chat();
    const call = (events.find((e) => e.type === "tool_call") as any).call;
    expect(call.status).toBe("proposed");
    expect(call.kind).toBe("mutation");
    expect(call.preview.title).toBe('post.create: "Draft me"');
    expect(h.db.select().from(posts).all().length).toBe(0);
    expect((events.find((e) => e.type === "message") as any).message.planPending).toBe(true);
  });

  test("a post.update proposal carries a unified diff", async () => {
    const post: any = unwrap(await h.call(ADMIN, "post.create", { type: "post", title: "Old", content: "alpha\nbeta" }));
    restore = scriptChat([[use("m1", "post.update", { id: post.id, content: "alpha\ngamma" })], []]).restore;

    const call = (((await chat()).find((e) => e.type === "tool_call")) as any).call;
    expect(call.preview.title).toBe('post.update: "Old"');
    expect(call.preview.diff).toContain("-beta");
    expect(call.preview.diff).toContain("+gamma");
  });

  test("the model sees the proposal result and the thread is persisted", async () => {
    const script = scriptChat([[use("m1", "post.create", { type: "post", title: "X" })], [{ type: "token", text: "ok" }]]);
    restore = script.restore;
    const events = await chat();

    const second = script.seen[1]!;
    const results = (second.messages.at(-1)!.content as any[]).filter((p) => p.type === "toolResult");
    expect(JSON.parse(results[0].content).status).toContain("awaiting user approval");

    const thread = events.find((e) => e.type === "thread") as any;
    expect(thread.title).toBe("hi");
    const got: any = unwrap(await h.call(ADMIN, "chat.get", { id: thread.threadId }));
    expect(got.messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
  });

  test("usage is metered as chat.send on the chat channel", async () => {
    restore = scriptChat([[{ type: "token", text: "hello" }]]).restore;
    await chat();
    const rows = h.db.select().from(aiUsage).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.tool).toBe("chat.send");
    expect(rows[0]!.channel).toBe("chat");
  });
});

describe("unifiedDiff", () => {
  test("is empty for identical input", () => expect(unifiedDiff("a", "a")).toBe(""));
  test("marks removals and additions", () => {
    const d = unifiedDiff("a\nb\nc", "a\nB\nc");
    expect(d).toContain("-b");
    expect(d).toContain("+B");
    expect(d).toContain(" a");
  });
});
