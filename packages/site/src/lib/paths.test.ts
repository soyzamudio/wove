import { describe, expect, test } from "bun:test";
import type { Post, Settings } from "@wove/sdk";
import { buildRssFeed } from "./rss";
import { formatLlmsTxt } from "./llms";

// The site resolves paths through the mock fixtures when MOCK=1; set it before the
// module graph that reads it is imported.
process.env.MOCK = "1";
const { getByPath, listAllPublished } = await import("./api");
const { GET: sitemapGet } = await import("../pages/sitemap.xml");
const { GET: feedGet } = await import("../pages/feed.json");
const { GET: llmsGet } = await import("../pages/llms.txt");

const route = async (fn: (ctx: any) => Promise<Response> | Response) => await (fn as any)({});

describe("getByPath (mock)", () => {
  test("resolves a nested page at its full path", async () => {
    const post = await getByPath("/services/consulting");
    expect(post?.slug).toBe("consulting");
    expect(post?.parentId).toBe("5");
  });

  test("the child's bare slug is not an address", async () => {
    expect(await getByPath("/consulting")).toBe(null);
    expect(await getByPath("/wrong/consulting")).toBe(null);
  });

  test("top-level posts and pages still resolve, trailing slash included", async () => {
    expect((await getByPath("/hello-world"))?.id).toBe("1");
    expect((await getByPath("/about/"))?.slug).toBe("about");
    expect(await getByPath("/nope")).toBe(null);
  });
});

describe("generated links use Post.path", () => {
  test("sitemap, json feed and llms.txt emit full paths", async () => {
    const xml = await (await route(sitemapGet)).text();
    expect(xml).toContain("<loc>http://localhost:4321/services/consulting</loc>");
    expect(xml).toContain("<loc>http://localhost:4321/hello-world</loc>");

    const feed = JSON.parse(await (await route(feedGet)).text());
    expect(feed.items.map((i: any) => i.url)).toContain("http://localhost:4321/hello-world");

    const llms = await (await route(llmsGet)).text();
    expect(llms).toContain("(http://localhost:4321/services/consulting)");
  });

  test("every published fixture carries a path", async () => {
    for (const post of await listAllPublished()) expect(post.path.startsWith("/")).toBe(true);
  });
});

// A site whose posts sit under /blog/: the permalink prefix rides along in `path`, so the
// feed and index formatters need no permalink knowledge of their own.
const prefixed: Settings = {
  siteTitle: "Prefixed",
  tagline: "",
  siteUrl: "http://localhost:4321",
  theme: "default",
  postsPerPage: 10,
  postPermalink: "/blog/:slug",
};

const post = (overrides: Partial<Post> = {}): Post => ({
  id: "1", type: "post", slug: "hello", title: "Hello", content: "c", format: "markdown", blocks: null,
  excerpt: null, featuredImage: null,
  seo: { title: null, description: null, ogImage: null, noindex: false },
  status: "published", parentId: null, path: "/blog/hello", authorId: null,
  publishedAt: "2026-01-01T00:00:00.000Z", meta: {}, terms: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("permalink prefix", () => {
  test("rss links and llms.txt entries carry the prefix", () => {
    const xml = buildRssFeed(prefixed, [{ post: post(), siteUrl: prefixed.siteUrl, contentHtml: "<p>c</p>" }]);
    expect(xml).toContain("<link>http://localhost:4321/blog/hello</link>");

    const txt = formatLlmsTxt(prefixed, [{ path: "/blog/hello", title: "Hello", excerpt: null }]);
    expect(txt).toContain("- [Hello](http://localhost:4321/blog/hello)");
  });
});
