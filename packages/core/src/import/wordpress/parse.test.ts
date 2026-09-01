import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseWxr, wpDateToIso } from "./parse";

export const FIXTURE = join(import.meta.dir, "fixtures", "sample.xml");
export const fixtureXml = () => Bun.file(FIXTURE).text();

describe("parseWxr", () => {
  test("reads the channel header", async () => {
    const doc = parseWxr(await fixtureXml());
    expect(doc.siteTitle).toBe("Old Site");
    expect(doc.baseSiteUrl).toBe("https://old.site");
    expect(doc.version).toBe("1.2");
  });

  test("reads authors, terms (incl. nav_menu) and every item", async () => {
    const doc = parseWxr(await fixtureXml());
    expect(doc.authors).toEqual([
      { login: "jane", email: "jane@old.site", displayName: "Jane Doe" },
    ]);
    expect(doc.terms.map((t) => `${t.taxonomy}:${t.slug}`)).toEqual([
      "category:news", "post_tag:release", "nav_menu:primary-menu",
    ]);
    expect(doc.items).toHaveLength(10);
    const byType = (t: string) => doc.items.filter((i) => i.postType === t).length;
    expect(byType("post")).toBe(4);
    expect(byType("page")).toBe(1);
    expect(byType("attachment")).toBe(2);
    expect(byType("nav_menu_item")).toBe(3);
  });

  test("decodes entities, CDATA, categories and postmeta", async () => {
    const doc = parseWxr(await fixtureXml());
    const post = doc.items.find((i) => i.postId === "10")!;
    expect(post.title).toBe("Hello World & Friends");
    expect(post.postName).toBe("hello-world");
    expect(post.creator).toBe("jane");
    expect(post.content).toContain("<!-- wp:paragraph -->");
    expect(post.excerpt).toContain("<em>intro</em>");
    expect(post.categories).toEqual([
      { domain: "category", nicename: "news", name: "News" },
      { domain: "post_tag", nicename: "release", name: "Release" },
    ]);
    expect(post.meta._thumbnail_id).toBe("101");
    expect(post.meta._yoast_wpseo_title).toBe("Hello World — Old Site");
    expect(post.meta["_yoast_wpseo_meta-robots-noindex"]).toBe("1");
  });

  test("prefers post_date_gmt and falls back to post_date", async () => {
    const doc = parseWxr(await fixtureXml());
    expect(doc.items.find((i) => i.postId === "10")!.date).toBe("2021-03-04T10:00:00.000Z");
    // draft has an all-zeroes GMT date, so the local date is used
    expect(doc.items.find((i) => i.postId === "13")!.date).toBe("2021-05-01T12:00:00.000Z");
  });

  test("reads attachment urls and menu item meta", async () => {
    const doc = parseWxr(await fixtureXml());
    expect(doc.items.find((i) => i.postId === "101")!.attachmentUrl)
      .toBe("https://old.site/wp-content/uploads/2021/03/photo.jpg");
    const nested = doc.items.find((i) => i.postId === "202")!;
    expect(nested.meta._menu_item_menu_item_parent).toBe("201");
    expect(nested.categories[0]).toEqual({ domain: "nav_menu", nicename: "primary-menu", name: "Primary Menu" });
    expect(doc.items.find((i) => i.postId === "203")!.meta._menu_item_url).toBe("https://docs.example.com/");
  });

  test("rejects non-WXR input", () => {
    expect(() => parseWxr("<html><body>nope</body></html>")).toThrow(/Not a WXR file/);
  });
});

describe("wpDateToIso", () => {
  test("treats WordPress GMT timestamps as UTC", () => {
    expect(wpDateToIso("2021-03-04 10:00:00")).toBe("2021-03-04T10:00:00.000Z");
  });
  test("returns null for unset dates", () => {
    expect(wpDateToIso("0000-00-00 00:00:00")).toBeNull();
    expect(wpDateToIso("")).toBeNull();
    expect(wpDateToIso(null)).toBeNull();
  });
});
