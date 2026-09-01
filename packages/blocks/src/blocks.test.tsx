import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockProps, BlocksDoc, type BlockType } from "@agentpress/sdk";
import { BLOCK_TYPES, blockDefaults, newBlock, resolveUrl, renderMarkdown, BlockRenderer, BlockView } from "./index";
import { sampleDoc } from "./fixtures";
import { resolveIcon } from "./icon";
import { Icon } from "./index";

describe("resolveUrl", () => {
  test("prefixes /media paths with mediaBase", () => {
    expect(resolveUrl("/media/x.png", { mediaBase: "http://localhost:8787" })).toBe(
      "http://localhost:8787/media/x.png",
    );
    expect(resolveUrl("/media/x.png", { mediaBase: "http://localhost:8787/" })).toBe(
      "http://localhost:8787/media/x.png",
    );
  });
  test("leaves absolute urls untouched", () => {
    for (const u of ["https://a.com/x.png", "http://a.com/x", "//cdn.a.com/x", "mailto:a@b.c", "data:image/png;base64,AA"]) {
      expect(resolveUrl(u, { mediaBase: "http://x", linkBase: "/base" })).toBe(u);
    }
  });
  test("uses linkBase for other root-relative urls, and passes through the rest", () => {
    expect(resolveUrl("/about", { linkBase: "/base" })).toBe("/base/about");
    expect(resolveUrl("/about")).toBe("/about");
    expect(resolveUrl("#top", { linkBase: "/base" })).toBe("#top");
    expect(resolveUrl("relative/x", { linkBase: "/base" })).toBe("relative/x");
    expect(resolveUrl(undefined)).toBe("");
  });
});

describe("blockDefaults", () => {
  test("every block type has defaults valid against its schema", () => {
    for (const type of BLOCK_TYPES) {
      const parsed = BlockProps[type].safeParse(blockDefaults(type));
      if (!parsed.success) throw new Error(`${type}: ${parsed.error.message}`);
      expect(parsed.success).toBe(true);
    }
  });
  test("BLOCK_TYPES covers the schema exactly", () => {
    expect([...BLOCK_TYPES].sort()).toEqual((Object.keys(BlockProps) as BlockType[]).sort());
  });
  test("newBlock produces a valid, unique-id block", () => {
    const a = newBlock("hero");
    const b = newBlock("hero");
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThan(6);
    expect(BlockProps.hero.safeParse(a.props).success).toBe(true);
  });
  test("defaults are not shared between instances", () => {
    const a = blockDefaults("features");
    a.items[0]!.title = "mutated";
    expect(blockDefaults("features").items[0]!.title).not.toBe("mutated");
  });
});

describe("rendering", () => {
  test("every block type renders without throwing", () => {
    for (const type of BLOCK_TYPES) {
      const html = renderToStaticMarkup(<BlockView block={newBlock(type)} ctx={{}} />);
      expect(html.length).toBeGreaterThan(10);
    }
  });

  test("sampleDoc is a valid BlocksDoc with one of every type", () => {
    const doc = sampleDoc();
    expect(BlocksDoc.safeParse(doc).success).toBe(true);
    expect(doc.blocks.map((b) => b.type)).toEqual(BLOCK_TYPES);
  });

  test("BlockRenderer wraps each block in a section with id + type class", () => {
    const doc = sampleDoc();
    const html = renderToStaticMarkup(<BlockRenderer doc={doc} ctx={{}} />);
    for (const block of doc.blocks) {
      expect(html).toContain(`ap-block ap-block--${block.type}`);
      expect(html).toContain(`data-block-id="${block.id}"`);
    }
  });

  test("headlines and key markup appear", () => {
    const html = renderToStaticMarkup(<BlockRenderer doc={sampleDoc()} ctx={{ mediaBase: "https://cdn.test" }} />);
    expect(html).toContain("A CMS your agents can actually use");
    expect(html).toContain("Everything you need");
    expect(html).toContain("Publish your first page today");
    expect(html).toContain("Frequently asked questions");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("ap-btn ap-btn--primary");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("https://cdn.test/media/placeholder.svg");
    expect(html).toContain("<svg"); // lucide icons
    expect(html).toContain("Built from blocks");
  });

  test("html block injects raw html", () => {
    const html = renderToStaticMarkup(
      <BlockView block={{ id: "x", type: "html", props: { html: "<b>raw</b>" } }} ctx={{}} />,
    );
    expect(html).toContain("<b>raw</b>");
  });
});

describe("helpers", () => {
  test("renderMarkdown is synchronous and returns html", () => {
    expect(renderMarkdown("# Hi")).toContain("<h1");
    expect(renderMarkdown("")).toBe("");
  });
  test("resolveIcon resolves kebab names and falls back for unknown ones", () => {
    const zap = resolveIcon("zap");
    const shield = resolveIcon("shield-check");
    const fallback = resolveIcon("not-a-real-icon-xyz");
    for (const c of [zap, shield, fallback, resolveIcon(undefined)]) expect(c).toBeDefined();
    expect(zap).not.toBe(fallback);
    expect(shield).not.toBe(fallback);
    expect(resolveIcon(undefined)).toBe(fallback);
    expect(renderToStaticMarkup(<Icon name="zap" />)).not.toBe(renderToStaticMarkup(<Icon name="nope-xyz" />));
  });
});
