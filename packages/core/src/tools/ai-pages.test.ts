import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Block, BlocksDoc, Post } from "@agentpress/sdk";
import { aiUsage } from "../db/schema";
import { ADMIN, EDITOR, makeHarness, unwrap } from "../test-helpers";
import { setProviderFactory, type AiProviderClient, type AiProviderOptions } from "../ai/provider";

const h = makeHarness();
afterAll(() => h.cleanup());

/** Canned provider, installed per-test so it cannot leak into the other AI suites. */
let nextTexts: string[] = [];
let seen: { system: string; prompt: string; maxTokens: number }[] = [];
let restore: (() => void) | null = null;

const fake = (texts: string | string[]) => { nextTexts = Array.isArray(texts) ? [...texts] : [texts]; };

beforeEach(() => {
  h.db.delete(aiUsage).run();
  seen = [];
  nextTexts = [];
  restore = setProviderFactory((opts: AiProviderOptions): AiProviderClient => ({
    async generate(req) {
      seen.push(req);
      return { text: nextTexts.shift() ?? "canned", model: opts.model, usage: { inputTokens: 11, outputTokens: 22 } };
    },
    async *stream() {
      yield { type: "done", model: opts.model, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async listModels() { return []; },
  }));
});
afterEach(() => { restore?.(); restore = null; });

const HERO = { type: "hero", props: { headline: "Agents that publish", subheadline: "One typed tool per action." } };
const CTA = { type: "cta", props: { headline: "Start now", buttons: [{ label: "Docs", href: "/docs" }] } };

const pageJson = (title = "Agent CMS") => JSON.stringify({ title, blocks: [HERO, CTA] });

describe("ai.generatePage", () => {
  test("parses fenced JSON and returns a normalised document", async () => {
    fake("Here you go!\n```json\n" + pageJson() + "\n```");
    const r = unwrap<{ title: string; doc: BlocksDoc; post: Post | null; usage: any }>(
      await h.call(ADMIN, "ai.generatePage", { prompt: "a landing page for an agent-first CMS" }),
    );
    expect(r.title).toBe("Agent CMS");
    expect(r.doc.blocks.map((b) => b.type)).toEqual(["hero", "cta"]);
    expect(r.doc.blocks[0]!.id.length).toBeGreaterThan(0);
    expect(r.post).toBe(null);
    expect(r.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    expect(seen.length).toBe(1);
  });

  test("the system prompt carries the block catalog but never the html block", async () => {
    fake(pageJson());
    unwrap(await h.call(ADMIN, "ai.generatePage", { prompt: "x" }));
    const system = seen[0]!.system;
    expect(system).toContain("- hero:");
    expect(system).toContain("- faq:");
    expect(system).not.toContain("- html:");
    expect(system).toContain('{"title": string, "blocks": Block[]}');
    expect(seen[0]!.maxTokens).toBe(16000);
  });

  test("retries once with the validation errors, then succeeds", async () => {
    fake([JSON.stringify({ title: "Broken", blocks: [{ type: "hero", props: {} }] }), pageJson("Second Try")]);
    const r = unwrap<{ title: string; doc: BlocksDoc; usage: any }>(
      await h.call(ADMIN, "ai.generatePage", { prompt: "x" }),
    );
    expect(r.title).toBe("Second Try");
    expect(seen.length).toBe(2);
    expect(seen[1]!.prompt).toContain("Fix these errors and return only JSON:");
    expect(seen[1]!.prompt).toContain("headline");
    // both attempts are metered
    expect(h.db.select().from(aiUsage).all().length).toBe(2);
    expect(r.usage).toEqual({ inputTokens: 22, outputTokens: 44 });
  });

  test("gives up with a validation_error after the retry", async () => {
    fake(["not json", "still not json"]);
    const r = await h.call(ADMIN, "ai.generatePage", { prompt: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("validation_error");
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.error.details)).toContain("issues");
    }
  });

  test("save:true creates a draft page with the blocks", async () => {
    fake(pageJson("Saved Page"));
    const r = unwrap<{ title: string; post: Post }>(
      await h.call(ADMIN, "ai.generatePage", { prompt: "x", save: true }),
    );
    expect(r.post.type).toBe("page");
    expect(r.post.status).toBe("draft");
    expect(r.post.title).toBe("Saved Page");
    expect(r.post.slug).toBe("saved-page");
    expect(r.post.format).toBe("blocks");
    expect(r.post.blocks!.blocks.map((b) => b.type)).toEqual(["hero", "cta"]);
    expect(r.post.excerpt).toBe("One typed tool per action.");

    const fetched = unwrap<Post>(await h.call(ADMIN, "post.get", { id: r.post.id }));
    expect(fetched.blocks!.blocks.length).toBe(2);
  });

  test("an explicit title overrides the model's", async () => {
    fake(pageJson("Model Title"));
    const r = unwrap<{ title: string }>(await h.call(ADMIN, "ai.generatePage", { prompt: "x", title: "My Title" }));
    expect(r.title).toBe("My Title");
    expect(seen[0]!.prompt).toContain("My Title");
  });

  test("requires ai:use", async () => {
    const r = await h.call(EDITOR, "ai.generatePage", { prompt: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

describe("ai.generateBlock", () => {
  test("forces the requested type and retries when the model picks another", async () => {
    fake([JSON.stringify(HERO), JSON.stringify({ type: "faq", props: { items: [{ question: "Q?", answer: "A." }] } })]);
    const r = unwrap<{ block: Block; usage: any }>(
      await h.call(ADMIN, "ai.generateBlock", { prompt: "three common questions", type: "faq" }),
    );
    expect(r.block.type).toBe("faq");
    expect(seen[0]!.system).toContain("Return ONLY a JSON Block of type faq");
    expect(seen[1]!.prompt).toContain('expected "faq"');
  });

  test("lets the model choose the type when none is forced", async () => {
    fake(JSON.stringify({ type: "stats", props: { items: [{ value: "32", label: "tools" }] } }));
    const r = unwrap<{ block: Block }>(await h.call(ADMIN, "ai.generateBlock", { prompt: "the numbers" }));
    expect(r.block.type).toBe("stats");
    expect(r.block.id.length).toBeGreaterThan(0);
    expect(seen[0]!.system).toContain("choosing the type that best fits");
  });

  test("includes the page's existing blocks as context", async () => {
    const page = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "Context Page", blocks: { version: 1, blocks: [HERO] },
    }));
    fake(JSON.stringify(CTA));
    unwrap(await h.call(ADMIN, "ai.generateBlock", { prompt: "a closer", postId: page.id }));
    expect(seen[0]!.system).toContain("Existing blocks: hero (\"Agents that publish\")");
    expect(seen[0]!.system).toContain("Context Page");
  });
});

describe("ai.editBlock", () => {
  const current = { id: "blk-1", type: "hero" as const, props: { headline: "Old", buttons: [], layout: "split" as const } };

  test("keeps the id and the type", async () => {
    fake(JSON.stringify({ id: "model-made-this-up", type: "hero", props: { headline: "New and punchy" } }));
    const r = unwrap<{ block: Block }>(
      await h.call(ADMIN, "ai.editBlock", { block: current, instruction: "make it punchier" }),
    );
    expect(r.block.id).toBe("blk-1");
    expect(r.block.type).toBe("hero");
    expect((r.block.props as any).headline).toBe("New and punchy");
    expect(seen[0]!.prompt).toContain("make it punchier");
    expect(seen[0]!.prompt).toContain('"headline":"Old"');
  });

  test("retries when the model changes the type, then gives up", async () => {
    fake([JSON.stringify(CTA), JSON.stringify(CTA)]);
    const r = await h.call(ADMIN, "ai.editBlock", { block: current, instruction: "turn it into a cta" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation_error");
    expect(seen.length).toBe(2);
    expect(seen[1]!.prompt).toContain('must stay "hero"');
  });
});
