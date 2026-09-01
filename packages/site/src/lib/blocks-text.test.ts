import { describe, expect, test } from "bun:test";
import type { BlocksDoc } from "@wove/sdk";
import { sampleCollections } from "@wove/blocks";
import { blocksToMarkdown } from "./blocks-text";

describe("blocksToMarkdown", () => {
  test("renders a hero block with headline, subheadline and buttons", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "1",
          type: "hero",
          props: {
            eyebrow: "Wove",
            headline: "A CMS your agents can actually use",
            subheadline: "Typed content, a real API.",
            buttons: [{ label: "Get started", href: "/start", variant: "primary" }],
            layout: "split",
          },
        },
      ],
    };
    const out = blocksToMarkdown(doc);
    expect(out).toContain("# A CMS your agents can actually use");
    expect(out).toContain("Wove");
    expect(out).toContain("Typed content, a real API.");
    expect(out).toContain("[Get started](/start)");
  });

  test("renders features as a bulleted list", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "2",
          type: "features",
          props: {
            headline: "Why us",
            items: [{ title: "Fast", body: "Ships quickly." }],
            columns: 3,
          },
        },
      ],
    };
    const out = blocksToMarkdown(doc);
    expect(out).toContain("## Why us");
    expect(out).toContain("- **Fast** — Ships quickly.");
  });

  test("renders markdown blocks as-is", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [{ id: "3", type: "markdown", props: { markdown: "## Built from blocks\n\nSome text.", width: "content" } }],
    };
    expect(blocksToMarkdown(doc)).toBe("## Built from blocks\n\nSome text.");
  });

  test("renders faq as question/answer pairs", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "4",
          type: "faq",
          props: { items: [{ question: "Is it free?", answer: "Yes." }] },
        },
      ],
    };
    const out = blocksToMarkdown(doc);
    expect(out).toContain("**Is it free?**");
    expect(out).toContain("Yes.");
  });

  test("renders stats as value/label bullets", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "5",
          type: "stats",
          props: { items: [{ value: "99%", label: "uptime" }] },
        },
      ],
    };
    expect(blocksToMarkdown(doc)).toContain("- 99% uptime");
  });

  test("renders testimonials as attributed quotes", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "6",
          type: "testimonials",
          props: { items: [{ quote: "Great product", name: "Ada", role: "Engineer" }] },
        },
      ],
    };
    const out = blocksToMarkdown(doc);
    expect(out).toContain("> Great product");
    expect(out).toContain("— Ada, Engineer");
  });

  test("renders cta with headline and buttons", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "7",
          type: "cta",
          props: {
            headline: "Publish today",
            buttons: [{ label: "Sign up", href: "/signup", variant: "primary" }],
            style: "card",
          },
        },
      ],
    };
    const out = blocksToMarkdown(doc);
    expect(out).toContain("## Publish today");
    expect(out).toContain("[Sign up](/signup)");
  });

  test("renders image and gallery blocks", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        { id: "8", type: "image", props: { image: { url: "/media/a.jpg", alt: "A" }, width: "wide" } },
        {
          id: "9",
          type: "gallery",
          props: { images: [{ url: "/media/b.jpg", alt: "B" }], columns: 3 },
        },
      ],
    };
    const out = blocksToMarkdown(doc);
    expect(out).toContain("![A](/media/a.jpg)");
    expect(out).toContain("![B](/media/b.jpg)");
  });

  test("renders logos as an alt-text list", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "10",
          type: "logos",
          props: { logos: [{ url: "/media/l.png", alt: "Acme" }] },
        },
      ],
    };
    expect(blocksToMarkdown(doc)).toContain("Acme");
  });

  test("renders columns by concatenating each column's markdown", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "11",
          type: "columns",
          props: { columns: [{ markdown: "Left" }, { markdown: "Right" }] },
        },
      ],
    };
    const out = blocksToMarkdown(doc);
    expect(out).toContain("Left");
    expect(out).toContain("Right");
  });

  test("strips tags from html blocks", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [{ id: "12", type: "html", props: { html: "<div><p>Hello <b>world</b></p></div>" } }],
    };
    expect(blocksToMarkdown(doc)).toBe("Hello world");
  });

  test("joins multiple blocks and skips empty output", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        { id: "13", type: "html", props: { html: "" } },
        { id: "14", type: "markdown", props: { markdown: "Body text", width: "content" } },
      ],
    };
    expect(blocksToMarkdown(doc)).toBe("Body text");
  });

  test("renders a collection block as a headline plus entry bullets when data is available", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "15",
          type: "collection",
          props: { collection: "team", headline: "Meet the team", layout: "grid", columns: 3, limit: 2 },
        },
      ],
    };
    const out = blocksToMarkdown(doc, sampleCollections());
    expect(out).toContain("## Meet the team");
    expect(out).toContain("- **Dana Whitfield** — Head of Product");
    expect(out).toContain("- **Marcus Lee** — Editor");
    expect(out).not.toContain("Priya Raman"); // limit: 2
  });

  test("falls back to a note when no collection data was passed", () => {
    const doc: BlocksDoc = {
      version: 1,
      blocks: [
        {
          id: "16",
          type: "collection",
          props: { collection: "events", layout: "list", columns: 3, limit: 6 },
        },
      ],
    };
    expect(blocksToMarkdown(doc)).toBe('_Entries from the "events" collection._');
  });
});
