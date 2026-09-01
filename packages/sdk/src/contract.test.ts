import { describe, expect, test } from "bun:test";
import { Block, BlockMeta, BlockProps, BlockType, BlocksDoc, Design, designToCssVars, FontMeta, FontChoice, Post, Scope, ToolCatalog, ToolDescriptions } from "./index";

describe("tool catalog", () => {
  test("every tool has a description and vice versa", () => {
    const tools = Object.keys(ToolCatalog).sort();
    const described = Object.keys(ToolDescriptions).sort();
    expect(described).toEqual(tools);
  });

  test("every tool declares valid scopes", () => {
    for (const [name, t] of Object.entries(ToolCatalog)) {
      expect(t.scopes.length, name).toBeGreaterThan(0);
      for (const s of t.scopes) expect(Scope.options, `${name}: ${s}`).toContain(s);
    }
  });

  test("tool names are namespaced (`area.action`)", () => {
    for (const name of Object.keys(ToolCatalog)) expect(name).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
  });
});

describe("blocks", () => {
  test("BlockType, BlockProps and BlockMeta agree", () => {
    expect(Object.keys(BlockProps).sort()).toEqual([...BlockType.options].sort());
    expect(Object.keys(BlockMeta).sort()).toEqual([...BlockType.options].sort());
  });

  test("a minimal doc parses with defaults filled and narrows by type", () => {
    const doc = BlocksDoc.parse({ blocks: [{ id: "a", type: "hero", props: { headline: "Hi" } }] });
    expect(doc.version).toBe(1);
    const b = doc.blocks[0];
    if (b.type === "hero") expect(b.props.layout).toBe("split");
    else throw new Error("expected hero");
  });

  test("unknown block types are rejected", () => {
    expect(() => Block.parse({ id: "x", type: "carousel", props: {} })).toThrow();
  });
});

describe("post", () => {
  test("format defaults to markdown and seo/featuredImage have defaults", () => {
    const p = Post.parse({
      id: "1", type: "post", slug: "hello", title: "Hello", content: "", excerpt: null, status: "draft",
      authorId: null, publishedAt: null, blocks: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    expect(p.format).toBe("markdown");
    expect(p.featuredImage).toBeNull();
    expect(p.seo.noindex).toBe(false);
  });
});

describe("design", () => {
  test("every font choice has metadata and the CSS vars cover the blocks renderer", () => {
    for (const f of FontChoice.options) expect(FontMeta[f].stack.length).toBeGreaterThan(0);
    const vars = designToCssVars(Design.parse({}));
    for (const k of ["--wv-accent", "--wv-bg", "--wv-fg", "--wv-font", "--wv-font-heading", "--wv-radius"]) expect(vars).toHaveProperty(k);
  });
});
