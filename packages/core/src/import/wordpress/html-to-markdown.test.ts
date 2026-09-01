import { describe, expect, test } from "bun:test";
import { htmlToMarkdown, parseShortcodeAttrs, rewriteUrls, stripSizeSuffix } from "./html-to-markdown";

describe("htmlToMarkdown", () => {
  test("strips Gutenberg block comments", () => {
    const { markdown } = htmlToMarkdown(`<!-- wp:paragraph {"align":"left"} --><p>Hi</p><!-- /wp:paragraph -->`);
    expect(markdown).toBe("Hi");
    expect(markdown).not.toContain("wp:");
  });

  test("converts [caption] to an image plus an italic caption", () => {
    const { markdown } = htmlToMarkdown(
      `[caption id="attachment_1" width="300"]<img src="/a.jpg" alt="A" /> The office[/caption]`,
    );
    expect(markdown).toBe("![A](/a.jpg)\n\n*The office*");
  });

  test("expands [gallery] from the attachment map and warns about misses", () => {
    const { markdown, warnings } = htmlToMarkdown(`<p>x</p>[gallery ids="1,2"]`, {
      attachments: new Map([["1", { url: "/media/one.jpg", alt: "One" }]]),
    });
    expect(markdown).toContain("![One](/media/one.jpg)");
    expect(warnings.join(" ")).toContain("attachment 2");
  });

  test("keeps tables as GFM", () => {
    const { markdown } = htmlToMarkdown(
      `<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>`,
    );
    expect(markdown).toContain("| A | B |");
    expect(markdown).toContain("| 1 | 2 |");
  });

  test("fences code with its language", () => {
    const { markdown } = htmlToMarkdown(`<pre><code class="language-js">const a = 1;</code></pre>`);
    expect(markdown).toBe("```js\nconst a = 1;\n```");
  });

  test("warns once per unknown shortcode and removes it", () => {
    const { markdown, warnings } = htmlToMarkdown(`<p>a</p>[su_box color="red"]<p>b</p>[su_box color="blue"]`);
    expect(markdown).not.toContain("su_box");
    expect(warnings.filter((w) => w.includes("su_box"))).toHaveLength(1);
  });

  test("leaves embed URLs on their own line", () => {
    const { markdown } = htmlToMarkdown(
      `<p>[embed]https://vimeo.com/12345[/embed]</p><p><a href="https://www.youtube.com/watch?v=x">https://www.youtube.com/watch?v=x</a></p>`,
    );
    expect(markdown.split("\n").map((l) => l.trim()).filter(Boolean)).toEqual([
      "https://vimeo.com/12345",
      "https://www.youtube.com/watch?v=x",
    ]);
  });

  test("preserves headings, lists, links and blockquotes and collapses blank runs", () => {
    const { markdown } = htmlToMarkdown(
      `<h2>T</h2><ul><li>one</li><li>two</li></ul><blockquote><p>q</p></blockquote><p><a href="/x">link</a></p>`,
    );
    expect(markdown).toBe("## T\n\n-   one\n-   two\n\n> q\n\n[link](/x)");
    expect(markdown).not.toMatch(/\n{3,}/);
  });
});

describe("parseShortcodeAttrs", () => {
  test("reads quoted and bare attributes", () => {
    expect(parseShortcodeAttrs(` ids="1,2" align=left`)).toEqual({ ids: "1,2", align: "left" });
  });
});

describe("rewriteUrls", () => {
  const map = {
    media: new Map([["https://old.site/wp-content/uploads/2021/03/photo.jpg", "/media/abc-photo.jpg"]]),
    siteUrls: ["https://old.site"],
    links: new Map([["/2021/03/hello-world", "/hello-world"]]),
  };

  test("maps media URLs, including size-suffixed variants", () => {
    expect(rewriteUrls("![](https://old.site/wp-content/uploads/2021/03/photo.jpg)", map))
      .toBe("![](/media/abc-photo.jpg)");
    expect(rewriteUrls("![](https://old.site/wp-content/uploads/2021/03/photo-300x200.jpg)", map))
      .toBe("![](/media/abc-photo.jpg)");
    expect(rewriteUrls("![](https://old.site/wp-content/uploads/2021/03/photo-1024x768.jpg?v=2)", map))
      .toBe("![](/media/abc-photo.jpg)");
  });

  test("turns old permalinks into site-relative slugs", () => {
    expect(rewriteUrls("[a](https://old.site/2021/03/hello-world/)", map)).toBe("[a](/hello-world)");
    expect(rewriteUrls("[a](https://old.site/2020/09/unknown-post/)", map)).toBe("[a](/unknown-post)");
  });

  test("leaves foreign URLs and unmapped uploads alone", () => {
    expect(rewriteUrls("[a](https://example.com/x)", map)).toBe("[a](https://example.com/x)");
    const missing = "https://old.site/wp-content/uploads/2019/01/gone.png";
    expect(rewriteUrls(`![](${missing})`, map)).toBe(`![](${missing})`);
  });

  test("keeps trailing sentence punctuation outside the URL", () => {
    expect(rewriteUrls("See https://old.site/2021/03/hello-world/.", map)).toBe("See /hello-world.");
  });
});

describe("stripSizeSuffix", () => {
  test("removes only WordPress size suffixes", () => {
    expect(stripSizeSuffix("/a/photo-300x200.jpg")).toBe("/a/photo.jpg");
    expect(stripSizeSuffix("/a/photo.jpg")).toBe("/a/photo.jpg");
    expect(stripSizeSuffix("/a/2021-03-04.jpg")).toBe("/a/2021-03-04.jpg");
  });
});
