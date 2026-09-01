import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockProps, BlocksDoc, type BlockType } from "@wove/sdk";
import { BLOCK_TYPES, blockDefaults, newBlock, resolveUrl, renderMarkdown, BlockRenderer, BlockView, imgAttrs, SIZES, type PropsOf } from "./index";
import { sampleDoc, sampleCollections } from "./fixtures";
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
      expect(html).toContain(`wv-block wv-block--${block.type}`);
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
    expect(html).toContain("wv-btn wv-btn--primary");
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

describe("responsive images", () => {
  const img = {
    url: "/media/m1-photo.png",
    alt: "A photo",
    width: 1200,
    height: 600,
    variants: [
      { width: 480, url: "/media/m1-photo.png.w480.webp", format: "webp" },
      { width: 960, url: "/media/m1-photo.png.w960.webp", format: "webp" },
      { width: 1200, url: "/media/m1-photo.png.w1200.webp", format: "webp" },
    ],
  };
  const plain = { url: "/media/m2-plain.png", alt: "No variants" };

  test("imgAttrs builds a srcset from variants and resolves urls against mediaBase", () => {
    const a = imgAttrs(img, { mediaBase: "https://cdn.test" }, SIZES.image) as any;
    expect(a.src).toBe("https://cdn.test/media/m1-photo.png");
    expect(a.srcSet).toBe(
      "https://cdn.test/media/m1-photo.png.w480.webp 480w, " +
        "https://cdn.test/media/m1-photo.png.w960.webp 960w, " +
        "https://cdn.test/media/m1-photo.png.w1200.webp 1200w",
    );
    expect(a.sizes).toBe(SIZES.image);
    expect(a.width).toBe(1200);
    expect(a.height).toBe(600);
  });

  test("imgAttrs omits srcset without variants, and without a sizes hint", () => {
    expect((imgAttrs(plain, {}, SIZES.image) as any).srcSet).toBeUndefined();
    expect((imgAttrs(img, {}) as any).srcSet).toBeUndefined();
    expect(imgAttrs(undefined, {})).toEqual({});
  });

  test("image block emits srcset, sizes and intrinsic dimensions", () => {
    const html = renderToStaticMarkup(
      <BlockView block={{ id: "x", type: "image", props: { image: img, width: "wide" } }} ctx={{}} />,
    );
    // React renders the attribute as `srcSet`; HTML attribute names are case-insensitive.
    expect(html).toContain(
      'srcSet="/media/m1-photo.png.w480.webp 480w, /media/m1-photo.png.w960.webp 960w, /media/m1-photo.png.w1200.webp 1200w"',
    );
    expect(html).toContain(`sizes="${SIZES.image}"`);
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="600"');
  });

  test("hero and gallery use their own sizes", () => {
    const hero = renderToStaticMarkup(
      <BlockView block={{ id: "h", type: "hero", props: { headline: "Hi", buttons: [], image: img, layout: "split" } }} ctx={{}} />,
    );
    expect(hero).toContain(`sizes="${SIZES.hero}"`);
    expect(hero).toContain("/media/m1-photo.png.w960.webp 960w");

    const gallery = renderToStaticMarkup(
      <BlockView block={{ id: "g", type: "gallery", props: { images: [img], columns: 3 } }} ctx={{}} />,
    );
    expect(gallery).toContain(`sizes="${SIZES.gallery}"`);
  });

  test("logos and avatars stay single-source but keep intrinsic dimensions", () => {
    const logos = renderToStaticMarkup(
      <BlockView block={{ id: "l", type: "logos", props: { logos: [img] } }} ctx={{}} />,
    );
    expect(logos).not.toMatch(/srcset/i);
    expect(logos).toContain('width="1200"');

    const quotes = renderToStaticMarkup(
      <BlockView
        block={{ id: "t", type: "testimonials", props: { items: [{ quote: "Great", name: "Ada", avatar: img }] } }}
        ctx={{}}
      />,
    );
    expect(quotes).not.toMatch(/srcset/i);
    expect(quotes).toContain("/media/m1-photo.png");
  });

  test("images without variants still render a plain src", () => {
    const html = renderToStaticMarkup(
      <BlockView block={{ id: "x", type: "image", props: { image: plain, width: "wide" } }} ctx={{}} />,
    );
    expect(html).toContain('src="/media/m2-plain.png"');
    expect(html).not.toMatch(/srcset/i);
  });
});

describe("collection block", () => {
  const block = (props: Partial<PropsOf<"collection">> = {}) =>
    ({ id: "c", type: "collection", props: { ...blockDefaults("collection"), ...props } }) as const;

  test("renders a placeholder when the host did not prefetch the collection", () => {
    const html = renderToStaticMarkup(<BlockView block={block()} ctx={{}} />);
    expect(html).toContain("wv-collection--empty");
    expect(html).toContain("team");
    expect(html).toContain("entries appear on the published site");
  });

  test("grid layout renders cards for every entry, up to limit", () => {
    const ctx = { collections: sampleCollections() };
    const html = renderToStaticMarkup(<BlockView block={block()} ctx={ctx} />);
    expect(html).toContain("wv-collection--grid");
    expect(html).toContain("wv-grid wv-grid--3");
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("Priya Raman");
    expect(html).toContain("Head of Product");
    expect(html).toContain("wv-collection__body--clamp");

    const limited = renderToStaticMarkup(<BlockView block={block({ limit: 2 })} ctx={ctx} />);
    expect(limited).toContain("Marcus Lee");
    expect(limited).not.toContain("Priya Raman");
  });

  test("list layout renders rows instead of a grid", () => {
    const html = renderToStaticMarkup(
      <BlockView block={block({ layout: "list" })} ctx={{ collections: sampleCollections() }} />,
    );
    expect(html).toContain("wv-collection--list");
    expect(html).toContain("wv-collection__list");
    expect(html).not.toContain("wv-grid--3");
    expect(html).not.toContain("wv-collection__body--clamp");
  });

  test("renders images, markdown fields and formatted dates; skips empty values", () => {
    const data = sampleCollections();
    data.team!.collection.fields.push(
      { key: "site", label: "Site", type: "url", required: false },
      { key: "featured", label: "Featured", type: "boolean", required: false },
      { key: "note", label: "Note", type: "text", required: false },
    );
    data.team!.entries[0]!.data = {
      ...data.team!.entries[0]!.data,
      photo: { url: "/media/dana.png", alt: "Dana", variants: [{ width: 480, url: "/media/dana.w480.webp" }] },
      site: "https://example.com",
      featured: true,
      note: "   ",
    };
    data.team!.entries[1]!.data = { ...data.team!.entries[1]!.data, featured: false, role: "" };

    const html = renderToStaticMarkup(<BlockView block={block()} ctx={{ collections: data, mediaBase: "https://cdn.test" }} />);
    expect(html).toContain("https://cdn.test/media/dana.png");
    expect(html).toContain("https://cdn.test/media/dana.w480.webp 480w");
    expect(html).toContain(`sizes="${SIZES.collection}"`);
    expect(html).toContain("<p>Dana keeps the roadmap honest"); // markdown rendered
    expect(html).toContain("Jan 1, 2026"); // date formatted
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("Featured"); // boolean true -> label
    expect(html).not.toContain(">Editor<"); // Marcus' role was emptied
    const bools = html.match(/wv-collection__field--bool/g) ?? [];
    expect(bools.length).toBe(1); // false booleans are skipped
  });
});
