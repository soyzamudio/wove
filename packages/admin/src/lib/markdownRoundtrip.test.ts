import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { BlockProps } from "@wove/sdk";
import { describeSchema } from "./schemaIntrospect";

/** Same extension set as RichMarkdownEditor.tsx, minus the React-only Placeholder. */
function makeEditor(markdown: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: {},
        horizontalRule: {},
      }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer" } }),
      Image.configure({ inline: false, allowBase64: false }),
      Markdown.configure({
        html: false,
        tightLists: true,
        linkify: false,
        breaks: false,
      }),
    ],
    content: markdown,
  });
}

function roundtrip(markdown: string): string {
  const editor = makeEditor(markdown);
  const out: string = editor.storage.markdown.getMarkdown();
  editor.destroy();
  return out;
}

describe("markdown roundtrip", () => {
  test("headings", () => {
    const out = roundtrip("# H1\n\n## H2\n\n### H3\n");
    expect(out).toContain("# H1");
    expect(out).toContain("## H2");
    expect(out).toContain("### H3");
  });

  test("inline formatting: bold, italic, strike, inline code", () => {
    const src = "This is **bold**, *italic*, ~~struck~~, and `inline code`.\n";
    const out = roundtrip(src);
    expect(out).toContain("**bold**");
    // tiptap-markdown normalizes italic emphasis to asterisks.
    expect(out).toContain("*italic*");
    expect(out).toContain("~~struck~~");
    expect(out).toContain("`inline code`");
  });

  test("links", () => {
    const out = roundtrip("Visit [our site](https://example.com) today.\n");
    expect(out).toContain("[our site](https://example.com)");
  });

  test("bulleted list normalizes `*` bullets to `-`", () => {
    const src = "* one\n* two\n* three\n";
    const out = roundtrip(src);
    expect(out).toContain("- one");
    expect(out).toContain("- two");
    expect(out).toContain("- three");
    expect(out).not.toContain("* one");
  });

  test("ordered list", () => {
    const src = "1. first\n2. second\n3. third\n";
    const out = roundtrip(src);
    expect(out).toContain("1. first");
    expect(out).toContain("2. second");
    expect(out).toContain("3. third");
  });

  test("blockquote", () => {
    const out = roundtrip("> A quoted thought.\n");
    expect(out).toContain("> A quoted thought.");
  });

  test("fenced code block preserves language and content", () => {
    const src = "```js\nconst x = 1;\n```\n";
    const out = roundtrip(src);
    expect(out).toContain("```js");
    expect(out).toContain("const x = 1;");
  });

  test("horizontal rule normalizes to `---`", () => {
    const out = roundtrip("above\n\n***\n\nbelow\n");
    expect(out).toContain("---");
  });

  test("image", () => {
    const out = roundtrip("![a cat](https://example.com/cat.png)\n");
    expect(out).toContain("![a cat](https://example.com/cat.png)");
  });

  test("full fixture doc roundtrips every construct", () => {
    const fixture = [
      "# Title",
      "",
      "## Subtitle",
      "",
      "### Section",
      "",
      "A paragraph with **bold**, *italic*, ~~strike~~, and `inline code`, plus a [link](https://example.com).",
      "",
      "* bullet one",
      "* bullet two",
      "",
      "1. step one",
      "2. step two",
      "",
      "> A blockquote.",
      "",
      "```js",
      "const answer = 42;",
      "```",
      "",
      "***",
      "",
      "![alt text](https://example.com/img.png)",
      "",
    ].join("\n");

    const out = roundtrip(fixture);

    expect(out).toContain("# Title");
    expect(out).toContain("## Subtitle");
    expect(out).toContain("### Section");
    expect(out).toContain("**bold**");
    expect(out).toContain("*italic*");
    expect(out).toContain("~~strike~~");
    expect(out).toContain("`inline code`");
    expect(out).toContain("[link](https://example.com)");
    expect(out).toContain("- bullet one"); // normalized from `*`
    expect(out).toContain("- bullet two");
    expect(out).toContain("1. step one");
    expect(out).toContain("2. step two");
    expect(out).toContain("> A blockquote.");
    expect(out).toContain("```js");
    expect(out).toContain("const answer = 42;");
    expect(out).toContain("---"); // normalized from `***`
    expect(out).toContain("![alt text](https://example.com/img.png)");

    // A second pass through the editor should be stable (idempotent).
    const out2 = roundtrip(out);
    expect(out2).toBe(out);
  });
});

describe("schemaIntrospect markdown detection", () => {
  test("the markdown block's `markdown` prop is flagged", () => {
    const fields = describeSchema(BlockProps.markdown);
    const markdownField = fields.find((f) => f.name === "markdown");
    expect(markdownField).toBeDefined();
    expect(markdownField!.kind.kind).toBe("string");
    expect((markdownField!.kind as { markdown?: boolean }).markdown).toBe(true);
  });

  test("columns' array item object flags its `markdown` field", () => {
    const fields = describeSchema(BlockProps.columns);
    const columnsField = fields.find((f) => f.name === "columns");
    expect(columnsField).toBeDefined();
    expect(columnsField!.kind.kind).toBe("array");
    const item = (columnsField!.kind as { item: any }).item;
    expect(item.kind).toBe("object");
    const markdownField = item.fields.find((f: any) => f.name === "markdown");
    expect(markdownField).toBeDefined();
    expect(markdownField.kind.markdown).toBe(true);
  });

  test("faq's items[].answer is flagged", () => {
    const fields = describeSchema(BlockProps.faq);
    const itemsField = fields.find((f) => f.name === "items");
    expect(itemsField).toBeDefined();
    const item = (itemsField!.kind as { item: any }).item;
    expect(item.kind).toBe("object");
    const answerField = item.fields.find((f: any) => f.name === "answer");
    expect(answerField).toBeDefined();
    expect(answerField.kind.markdown).toBe(true);
  });

  test("hero's subheadline is multiline but NOT flagged as markdown", () => {
    const fields = describeSchema(BlockProps.hero);
    const subheadline = fields.find((f) => f.name === "subheadline");
    expect(subheadline).toBeDefined();
    expect(subheadline!.kind.kind).toBe("string");
    expect((subheadline!.kind as { multiline: boolean }).multiline).toBe(true);
    expect((subheadline!.kind as { markdown?: boolean }).markdown).toBe(false);
  });
});
