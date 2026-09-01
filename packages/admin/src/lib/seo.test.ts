import { describe, expect, test } from "bun:test";
import {
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  counter,
  effectiveSeoTitle,
  previewUrl,
  seoPreview,
  truncate,
} from "./seo";

describe("counter", () => {
  test("counts characters and remaining budget", () => {
    expect(counter("hello", 10)).toEqual({ length: 5, max: 10, remaining: 5, over: false });
  });

  test("flags overflow with a negative remaining", () => {
    expect(counter("abcdef", 4)).toEqual({ length: 6, max: 4, remaining: -2, over: true });
  });

  test("treats null/undefined as empty", () => {
    expect(counter(null, SEO_TITLE_MAX).length).toBe(0);
    expect(counter(undefined, SEO_DESCRIPTION_MAX).over).toBe(false);
  });
});

describe("effectiveSeoTitle", () => {
  test("prefers the SEO title", () => {
    expect(effectiveSeoTitle("Custom", "Post title")).toBe("Custom");
  });

  test("falls back to the post title when blank", () => {
    expect(effectiveSeoTitle("   ", "Post title")).toBe("Post title");
    expect(effectiveSeoTitle(null, "Post title")).toBe("Post title");
  });

  test("falls back to a placeholder when both are empty", () => {
    expect(effectiveSeoTitle(null, "  ")).toBe("(untitled)");
  });
});

describe("previewUrl", () => {
  test("renders host + breadcrumb slug", () => {
    expect(previewUrl("https://example.com", "hello-world")).toBe("example.com › hello-world");
  });

  test("strips protocol, trailing slashes and leading slug slashes", () => {
    expect(previewUrl("http://example.com///", "/about")).toBe("example.com › about");
  });

  test("handles a missing site url and empty slug", () => {
    expect(previewUrl(null, "x")).toBe("example.com › x");
    expect(previewUrl("https://site.dev", "")).toBe("site.dev");
  });
});

describe("truncate", () => {
  test("leaves short text alone", () => {
    expect(truncate("short", 20)).toBe("short");
  });

  test("adds an ellipsis when over the limit", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });
});

describe("seoPreview", () => {
  test("derives title, url and description", () => {
    expect(
      seoPreview({ siteUrl: "https://example.com", slug: "post", postTitle: "Title", description: "Desc" })
    ).toEqual({ title: "Title", url: "example.com › post", description: "Desc" });
  });

  test("falls back to the excerpt, then to a hint", () => {
    expect(seoPreview({ slug: "a", postTitle: "T", excerpt: "From excerpt" }).description).toBe("From excerpt");
    expect(seoPreview({ slug: "a", postTitle: "T" }).description).toBe("No meta description yet.");
  });

  test("truncates over-long titles and descriptions", () => {
    const preview = seoPreview({ slug: "a", postTitle: "T".repeat(90), description: "D".repeat(200) });
    expect(preview.title.length).toBe(SEO_TITLE_MAX);
    expect(preview.description.length).toBe(SEO_DESCRIPTION_MAX);
    expect(preview.title.endsWith("…")).toBe(true);
  });
});
