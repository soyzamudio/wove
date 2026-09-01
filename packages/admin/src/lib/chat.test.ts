import { describe, expect, test } from "bun:test";
import type { ChatToolCall } from "@wove/sdk";
import { isReadCall, openInEditorTarget, planSummary } from "./chat";

function call(partial: Partial<ChatToolCall>): ChatToolCall {
  return {
    id: "c1",
    tool: "post.create",
    input: {},
    kind: "mutation",
    status: "proposed",
    result: null,
    preview: null,
    ...partial,
  } as ChatToolCall;
}

describe("planSummary", () => {
  test("counts each terminal status", () => {
    const calls = [
      call({ id: "a", status: "applied" }),
      call({ id: "b", status: "applied" }),
      call({ id: "c", status: "applied" }),
      call({ id: "d", status: "failed" }),
      call({ id: "e", status: "rejected" }),
    ];
    expect(planSummary(calls)).toBe("3 applied, 1 failed, 1 discarded");
  });

  test("ignores reads and still-proposed calls", () => {
    expect(planSummary([call({ status: "executed", kind: "read" }), call({ status: "proposed" })])).toBe("Nothing to apply");
  });
});

describe("openInEditorTarget", () => {
  test("routes a created page to /pages/:id", () => {
    const c = call({ status: "applied", tool: "post.create", result: { id: "p1", type: "page" } });
    expect(openInEditorTarget(c)).toBe("/pages/p1");
  });

  test("routes a created post to /posts/:id and unwraps a { post } envelope", () => {
    const c = call({ status: "applied", tool: "ai.generatePage", result: { post: { id: "p2", type: "post" } } });
    expect(openInEditorTarget(c)).toBe("/posts/p2");
  });

  test("falls back to the call input's type, then to post", () => {
    expect(openInEditorTarget(call({ status: "applied", input: { type: "page" }, result: { id: "p3" } }))).toBe("/pages/p3");
    expect(openInEditorTarget(call({ status: "applied", result: { id: "p4" } }))).toBe("/posts/p4");
  });

  test("returns null unless the call applied and carries an id", () => {
    expect(openInEditorTarget(call({ status: "proposed", result: { id: "p1" } }))).toBeNull();
    expect(openInEditorTarget(call({ status: "failed", result: "boom" }))).toBeNull();
    expect(openInEditorTarget(call({ status: "applied", tool: "post.update", result: { id: "p1" } }))).toBeNull();
    expect(openInEditorTarget(call({ status: "applied", result: { ok: true } }))).toBeNull();
  });
});

describe("isReadCall", () => {
  test("treats read-kind and executed calls as reads", () => {
    expect(isReadCall(call({ kind: "read", status: "executed" }))).toBe(true);
    expect(isReadCall(call({ kind: "mutation", status: "executed" }))).toBe(true);
    expect(isReadCall(call({ kind: "mutation", status: "proposed" }))).toBe(false);
    expect(isReadCall(call({ kind: "mutation", status: "applied" }))).toBe(false);
  });
});
