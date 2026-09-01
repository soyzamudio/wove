import { describe, expect, test, afterEach } from "bun:test";
import { createUser } from "../auth";
import { configureFakeAi, makeHarness, scriptChat } from "../test-helpers";

const h = makeHarness();
configureFakeAi(h.db);
let restore = () => {};
afterEach(() => restore());

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  h.app.fetch(new Request(`http://localhost:4000${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }));

/** `event: x` / `data: {...}` pairs, in order. */
async function sse(res: Response): Promise<{ event: string; data: any }[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.includes("event:"))
    .map((block) => {
      const event = /event:\s*(.+)/.exec(block)![1]!.trim();
      const data = /data:\s*([\s\S]+)/.exec(block)![1]!.trim();
      return { event, data: JSON.parse(data) };
    });
}

async function adminCookie(email: string) {
  await createUser(h.db, { email, name: "Chat", password: "password123", role: "admin" });
  const res = await post("/api/auth/login", { email, password: "password123" });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

describe("POST /api/chat/stream", () => {
  test("anonymous callers get a JSON 401 before any SSE byte", async () => {
    const res = await post("/api/chat/stream", { message: "hello" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).code).toBe("unauthenticated");
  });

  test("streams thread, token, tool_call, message and done for a scripted conversation", async () => {
    const cookie = await adminCookie("chat@example.com");
    restore = scriptChat([
      [{ type: "token", text: "Let me look." }, { type: "toolUse", id: "r1", name: "post.list", input: { limit: 5 } }],
      [{ type: "toolUse", id: "m1", name: "post.create", input: { type: "post", title: "New page" } }],
      [{ type: "token", text: "Approve to create it." }],
    ]).restore;

    const res = await post("/api/chat/stream", { message: "make me a page" }, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await sse(res);
    expect(events.map((e) => e.event)).toEqual([
      "thread", "token", "tool_call", "tool_call", "token", "message", "done",
    ]);
    expect(events[0]!.data.title).toBe("make me a page");
    expect(events[2]!.data.call).toMatchObject({ tool: "post.list", status: "executed" });
    expect(events[3]!.data.call).toMatchObject({ tool: "post.create", status: "proposed" });
    expect(events[5]!.data.message.planPending).toBe(true);
    expect(events[6]!.data.usage.outputTokens).toBeGreaterThan(0);
  });
});
