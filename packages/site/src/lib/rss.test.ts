import { describe, expect, test } from "bun:test";
import type { Post, Settings } from "@wove/sdk";
import { buildRssFeed, xmlEscape } from "./rss";

describe("xmlEscape", () => {
  test("escapes reserved XML characters", () => {
    expect(xmlEscape(`Tom & Jerry <3 "quotes" 'apostrophe'`)).toBe(
      "Tom &amp; Jerry &lt;3 &quot;quotes&quot; &apos;apostrophe&apos;",
    );
  });
});

const settings: Settings = {
  siteTitle: "Demo & Co",
  tagline: "Testing <feeds>",
  siteUrl: "http://localhost:4321",
  theme: "default",
  postsPerPage: 10,
  postPermalink: "/:slug",
};

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "1",
    type: "post",
    slug: "hello",
    title: "Hello & World",
    content: "content",
    format: "markdown",
    blocks: null,
    excerpt: "An excerpt",
    featuredImage: null,
    seo: { title: null, description: null, ogImage: null, noindex: false },
    status: "published",
    parentId: null,
    path: "/hello",
    authorId: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    meta: {},
    terms: [{ taxonomy: "tag", slug: "news", name: "News" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRssFeed", () => {
  test("escapes channel-level and item-level text and includes content:encoded", () => {
    const xml = buildRssFeed(settings, [{ post: post(), siteUrl: "http://localhost:4321", contentHtml: "<p>Body</p>" }]);
    expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    expect(xml).toContain("<title>Demo &amp; Co</title>");
    expect(xml).toContain("<title>Hello &amp; World</title>");
    expect(xml).toContain("<link>http://localhost:4321/hello</link>");
    expect(xml).toContain("<content:encoded><![CDATA[<p>Body</p>]]></content:encoded>");
    expect(xml).toContain("<category>News</category>");
  });
});
