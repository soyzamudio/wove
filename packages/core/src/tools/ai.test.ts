import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { AiConfig, AiUsageEntry, Post } from "@agentpress/sdk";
import { eq } from "drizzle-orm";
import { aiUsage, auditLog } from "../db/schema";
import { ADMIN, EDITOR, makeHarness, unwrap } from "../test-helpers";
import { clearSiteKey, resetEncryptionKey } from "../ai/keys";
import { setProviderFactory, type AiProviderClient, type AiProviderOptions } from "../ai/provider";

process.env.AGENTPRESS_SECRET = "test-secret-for-ai-tools";
resetEncryptionKey();

const h = makeHarness();
afterAll(() => h.cleanup());

/** Canned provider — no network, records what it was asked for. */
let nextTexts: string[] = [];
let seen: { opts: AiProviderOptions; system: string; prompt: string; maxTokens: number }[] = [];

function fake(text: string | string[]) {
  nextTexts = Array.isArray(text) ? [...text] : [text];
}

setProviderFactory((opts): AiProviderClient => ({
  async generate(req) {
    seen.push({ opts, ...req });
    return {
      text: nextTexts.shift() ?? "canned",
      model: opts.model,
      usage: { inputTokens: 11, outputTokens: 22 },
    };
  },
  async *stream(req) {
    seen.push({ opts, ...req });
    yield { type: "token", text: nextTexts.shift() ?? "canned" };
    yield { type: "done", model: opts.model, usage: { inputTokens: 11, outputTokens: 22 } };
  },
  async listModels() {
    return [{ id: "fake-1", name: "Fake One" }];
  },
}));

beforeEach(() => {
  h.db.delete(aiUsage).run();
  clearSiteKey(h.db);
  seen = [];
  nextTexts = [];
  delete process.env.AGENTPRESS_AI_ANTHROPIC_KEY;
});

const config = async () => unwrap<AiConfig>(await h.call(ADMIN, "ai.config", {}));

describe("ai.config / ai.configure", () => {
  test("defaults to anthropic + claude-opus-5 with no key", async () => {
    const c = await config();
    expect(c.provider).toBe("anthropic");
    expect(c.model).toBe("claude-opus-5");
    expect(c.keySource).toBe("none");
    expect(c.keyHint).toBe(null);
  });

  test("never returns the key itself", async () => {
    unwrap(await h.call(ADMIN, "ai.configure", { apiKey: "sk-secret-abcd" }));
    const c = await config();
    expect(JSON.stringify(c)).not.toContain("sk-secret-abcd");
    expect(c.keySource).toBe("byok");
    expect(c.keyHint).toBe("…abcd");
    unwrap(await h.call(ADMIN, "ai.configure", { clearKey: true }));
    expect((await config()).keySource).toBe("none");
  });

  test("settings.get does not leak ai.* rows", async () => {
    unwrap(await h.call(ADMIN, "ai.configure", { systemPrompt: "Be terse." }));
    const s = unwrap<Record<string, unknown>>(await h.call(ADMIN, "settings.get", {}));
    expect(Object.keys(s).some((k) => k.startsWith("ai."))).toBe(false);
    unwrap(await h.call(ADMIN, "ai.configure", { systemPrompt: null }));
  });

  test("switching provider with no model set fills that provider's default", async () => {
    unwrap(await h.call(ADMIN, "ai.configure", { provider: "openai" }));
    expect((await config()).model).toBe("gpt-5.6");
    unwrap(await h.call(ADMIN, "ai.configure", { provider: "google" }));
    expect((await config()).model).toBe("gemini-3.7-flash");
    // explicit model wins
    unwrap(await h.call(ADMIN, "ai.configure", { provider: "xai", model: "grok-mini" }));
    expect((await config()).model).toBe("grok-mini");
    unwrap(await h.call(ADMIN, "ai.configure", { provider: "anthropic", model: "claude-opus-5" }));
  });

  test("audit redacts the apiKey", async () => {
    unwrap(await h.call(ADMIN, "ai.configure", { apiKey: "sk-should-not-appear" }));
    const rows = h.db.select().from(auditLog).where(eq(auditLog.tool, "ai.configure")).all();
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("sk-should-not-appear");
    expect(JSON.stringify(rows)).toContain("[redacted]");
    unwrap(await h.call(ADMIN, "ai.configure", { clearKey: true }));
  });
});

describe("ai.generate / ai.rewrite", () => {
  test("returns text + usage and writes one ai_usage row", async () => {
    fake("# Hello\n\nBody.");
    const r = unwrap<{ text: string; model: string; usage: { inputTokens: number; outputTokens: number } }>(
      await h.call(ADMIN, "ai.generate", { prompt: "write something" }),
    );
    expect(r.text).toBe("# Hello\n\nBody.");
    expect(r.usage).toEqual({ inputTokens: 11, outputTokens: 22 });

    const rows = h.db.select().from(aiUsage).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.tool).toBe("ai.generate");
    expect(rows[0]!.ok).toBe(true);
    expect(rows[0]!.inputTokens).toBe(11);
    expect(rows[0]!.keySource).toBe("none");
  });

  test("system prompt carries site context and post context", async () => {
    const post = unwrap<Post>(await h.call(ADMIN, "post.create", { title: "Context Post", content: "Prior body" }));
    fake("ok");
    unwrap(await h.call(ADMIN, "ai.generate", { prompt: "continue", postId: post.id }));
    const system = seen.at(-1)!.system;
    expect(system).toContain("writing assistant");
    expect(system).toContain("Current post:");
    expect(system).toContain("Prior body");
  });

  test("rewrite passes the instruction in the system prompt", async () => {
    fake("shorter");
    const r = unwrap<{ text: string }>(await h.call(ADMIN, "ai.rewrite", { text: "long text", instruction: "make it shorter" }));
    expect(r.text).toBe("shorter");
    expect(seen.at(-1)!.system).toContain("make it shorter");
    expect(seen.at(-1)!.prompt).toBe("long text");
  });

  test("a failing provider still records ai_usage with ok=false", async () => {
    const restore = setProviderFactory(() => ({
      generate: async () => { throw new Error("connection refused"); },
      stream: async function* () { throw new Error("connection refused"); },
      listModels: async () => [],
    }));
    const r = await h.call(ADMIN, "ai.generate", { prompt: "boom" });
    restore();
    expect(r.ok).toBe(false);
    const rows = h.db.select().from(aiUsage).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.ok).toBe(false);
    expect(rows[0]!.inputTokens).toBe(0);
  });

  test("actor without ai:use gets 403", async () => {
    const r = await h.call(EDITOR, "ai.generate", { prompt: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

describe("ai.draftPost", () => {
  test("creates a draft from parsed JSON", async () => {
    fake(JSON.stringify({ title: "Ten Ways", excerpt: "A summary.", content: "## Body\n\ntext" }));
    const post = unwrap<Post>(await h.call(ADMIN, "ai.draftPost", { prompt: "ten ways", terms: [{ taxonomy: "tag", name: "Ideas" }] }));
    expect(post.title).toBe("Ten Ways");
    expect(post.excerpt).toBe("A summary.");
    expect(post.content).toContain("## Body");
    expect(post.status).toBe("draft");
    expect(post.slug).toBe("ten-ways");
    expect(post.terms.map((t) => t.name)).toContain("Ideas");
  });

  test("tolerates ```json fences", async () => {
    fake('Sure!\n```json\n{"title":"Fenced","excerpt":"E","content":"C"}\n```');
    const post = unwrap<Post>(await h.call(ADMIN, "ai.draftPost", { prompt: "x" }));
    expect(post.title).toBe("Fenced");
    expect(post.content).toBe("C");
  });

  test("retries once when the first response is not JSON", async () => {
    fake(["not json at all", '{"title":"Second Try","excerpt":"E","content":"C"}']);
    const post = unwrap<Post>(await h.call(ADMIN, "ai.draftPost", { prompt: "x" }));
    expect(post.title).toBe("Second Try");
    expect(seen.length).toBe(2);
    expect(h.db.select().from(aiUsage).all().length).toBe(2); // both attempts metered
  });

  test("gives up with a conflict after the retry", async () => {
    fake(["nope", "still nope"]);
    const r = await h.call(ADMIN, "ai.draftPost", { prompt: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("conflict");
  });
});

describe("ai.models / ai.test / ai.usage", () => {
  test("ai.models lists the provider's models", async () => {
    const models = unwrap<{ id: string; name: string | null }[]>(await h.call(ADMIN, "ai.models", {}));
    expect(models).toEqual([{ id: "fake-1", name: "Fake One" }]);
  });

  test("ai.test returns latency and meters the probe", async () => {
    fake("OK");
    const r = unwrap<{ ok: true; latencyMs: number; model: string }>(await h.call(ADMIN, "ai.test", {}));
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(h.db.select().from(aiUsage).all()[0]!.tool).toBe("ai.test");
  });

  test("ai.usage is newest-first, paginates, and totals the whole filtered set", async () => {
    for (let i = 0; i < 3; i++) {
      fake("x");
      unwrap(await h.call(ADMIN, "ai.generate", { prompt: `p${i}` }));
    }
    const page = unwrap<{ items: AiUsageEntry[]; nextCursor: string | null; totals: any }>(
      await h.call(ADMIN, "ai.usage", { limit: 2 }),
    );
    expect(page.items.length).toBe(2);
    expect(page.nextCursor).not.toBe(null);
    expect(page.totals).toEqual({ calls: 3, inputTokens: 33, outputTokens: 66 });

    const future = unwrap<{ items: AiUsageEntry[]; totals: any }>(
      await h.call(ADMIN, "ai.usage", { since: new Date(Date.now() + 60_000).toISOString() }),
    );
    expect(future.items.length).toBe(0);
    expect(future.totals.calls).toBe(0);
  });
});

describe("POST /api/ai/stream", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    h.app.request("/api/ai/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  test("anon is rejected with 401 JSON", async () => {
    const res = await post({ kind: "generate", prompt: "hi" });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthenticated");
  });

  test("streams token + done and records usage", async () => {
    const key = unwrap<{ apiKey: string }>(
      await h.call(ADMIN, "agent.create", { name: "streamer", scopes: ["ai:use"] }),
    ).apiKey;
    fake("streamed!");
    const res = await post({ kind: "generate", prompt: "hi" }, { authorization: `Bearer ${key}` });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain("event: token");
    expect(body).toContain('{"text":"streamed!"}');
    expect(body).toContain("event: done");

    const rows = h.db.select().from(aiUsage).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.ok).toBe(true);
    expect(rows[0]!.outputTokens).toBe(22);
  });

  test("an agent without ai:use gets 403", async () => {
    const key = unwrap<{ apiKey: string }>(
      await h.call(ADMIN, "agent.create", { name: "reader", scopes: ["content:read"] }),
    ).apiKey;
    const res = await post({ kind: "rewrite", text: "a", instruction: "b" }, { authorization: `Bearer ${key}` });
    expect(res.status).toBe(403);
  });
});
