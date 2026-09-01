import { describe, expect, test } from "bun:test";
import type { Post } from "@wove/sdk";
import { resolveSeo, resolveUrl } from "./seo";

const API_URL = "http://localhost:4000";

function basePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "1",
    type: "post",
    slug: "hello",
    title: "Hello",
    content: "content",
    format: "markdown",
    blocks: null,
    excerpt: "The excerpt",
    featuredImage: null,
    seo: { title: null, description: null, ogImage: null, noindex: false },
    status: "published",
    authorId: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    meta: {},
    terms: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveUrl", () => {
  test("leaves absolute URLs alone", () => {
    expect(resolveUrl("https://cdn.example.com/a.jpg", API_URL)).toBe("https://cdn.example.com/a.jpg");
  });

  test("prefixes relative media paths with the API origin", () => {
    expect(resolveUrl("/media/a.jpg", API_URL)).toBe("http://localhost:4000/media/a.jpg");
  });
});

describe("resolveSeo", () => {
  test("falls back to post title/excerpt when seo fields are unset", () => {
    const post = basePost();
    const seo = resolveSeo(post, API_URL);
    expect(seo.title).toBe("Hello");
    expect(seo.description).toBe("The excerpt");
    expect(seo.ogImage).toBeNull();
    expect(seo.noindex).toBe(false);
  });

  test("prefers explicit seo.title/description/ogImage over fallbacks", () => {
    const post = basePost({
      seo: { title: "Custom Title", description: "Custom desc", ogImage: { url: "/media/og.jpg", alt: "" }, noindex: true },
      featuredImage: { url: "/media/featured.jpg", alt: "" },
    });
    const seo = resolveSeo(post, API_URL);
    expect(seo.title).toBe("Custom Title");
    expect(seo.description).toBe("Custom desc");
    expect(seo.ogImage).toBe("http://localhost:4000/media/og.jpg");
    expect(seo.noindex).toBe(true);
  });

  test("falls back to featuredImage for ogImage when seo.ogImage is unset", () => {
    const post = basePost({ featuredImage: { url: "/media/featured.jpg", alt: "" } });
    const seo = resolveSeo(post, API_URL);
    expect(seo.ogImage).toBe("http://localhost:4000/media/featured.jpg");
  });

  test("resolves absolute image URLs unchanged", () => {
    const post = basePost({ featuredImage: { url: "https://cdn.example.com/img.jpg", alt: "" } });
    const seo = resolveSeo(post, API_URL);
    expect(seo.ogImage).toBe("https://cdn.example.com/img.jpg");
  });
});
