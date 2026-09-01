import { describe, expect, test } from "bun:test";
import { shouldReport404 } from "./redirects";

describe("shouldReport404", () => {
  test("reports content paths", () => {
    for (const p of ["/gone", "/blog/old-post", "/a/b?x=1"]) expect(shouldReport404(p)).toBe(true);
  });
  test("skips assets, api, admin, well-known and non-paths", () => {
    for (const p of [
      "/favicon.ico", "/img/a.png", "/a.jpeg", "/s.css", "/a.js", "/a.js.map", "/robots.txt",
      "/sitemap.xml", "/x.webp", "/f.woff", "/f.woff2",
      "/api", "/api/public/posts", "/admin", "/admin/settings", "/.well-known/acme-challenge/x",
      "relative", "", "https://x.test/a",
    ]) expect(shouldReport404(p)).toBe(false);
  });
});
