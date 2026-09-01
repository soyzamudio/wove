import { describe, expect, test } from "bun:test";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";

const h = makeHarness();
const req = (path: string) => h.app.fetch(new Request(`http://localhost:4000${path}`));

describe("menus", () => {
  test("set upserts, assigns missing ids, and validates hrefs", async () => {
    const created = unwrap(await h.call(ADMIN, "menu.set", {
      location: "header",
      name: "Header",
      items: [{ id: "", label: "Home", href: "/" }, { label: "Blog", href: "/blog" } as any],
    }));
    expect(created.items.map((i: any) => i.label)).toEqual(["Home", "Blog"]);
    for (const i of created.items) expect(i.id).toBeTruthy();

    const replaced = unwrap(await h.call(ADMIN, "menu.set", {
      location: "header",
      items: [{ id: "keep-me", label: "Docs", href: "https://example.com" }],
    }));
    expect(replaced.name).toBe("Header"); // name is preserved when omitted
    expect(replaced.items).toEqual([{ id: "keep-me", label: "Docs", href: "https://example.com" }]);
    expect(unwrap(await h.call(ADMIN, "menu.list", {})).length).toBe(1);

    for (const href of ["javascript:alert(1)", "data:text/html,x", "ftp://x/y"]) {
      const bad = await h.call(ADMIN, "menu.set", { location: "header", items: [{ id: "x", label: "Bad", href }] });
      expect(bad.ok).toBe(false);
    }
    for (const href of ["/x", "#top", "mailto:hi@example.com", "http://x.dev"]) {
      expect((await h.call(ADMIN, "menu.set", { location: "tmp", items: [{ id: "x", label: "Ok", href }] })).ok).toBe(true);
    }
  });

  test("get 404s for a missing location, delete removes it", async () => {
    const missing = await h.call(ADMIN, "menu.get", { location: "nowhere" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);

    unwrap(await h.call(ADMIN, "menu.set", { location: "footer", name: "Footer", items: [{ id: "a", label: "About", href: "/about" }] }));
    expect(unwrap(await h.call(ADMIN, "menu.get", { location: "footer" })).name).toBe("Footer");
    unwrap(await h.call(ADMIN, "menu.delete", { location: "footer" }));
    expect((await h.call(ADMIN, "menu.get", { location: "footer" })).ok).toBe(false);
  });

  test("public menus endpoint returns every menu", async () => {
    const res = await req("/api/public/menus");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((m: any) => m.location).sort()).toEqual(["header", "tmp"]);
  });
});

describe("design", () => {
  test("get returns SDK defaults", async () => {
    const d = unwrap(await h.call(ADMIN, "design.get", {}));
    expect(d.colors.accent).toBe("#2563eb");
    expect(d.fonts.body).toBe("system");
    expect(d.radius).toBe(12);
    expect(d.customCss).toBe("");
    expect(d.logo).toBeNull();
  });

  test("update deep-merges a partial patch", async () => {
    unwrap(await h.call(ADMIN, "design.update", { colors: { accent: "#ff0000" }, radius: 4 }));
    const once = unwrap(await h.call(ADMIN, "design.get", {}));
    expect(once.colors.accent).toBe("#ff0000");
    expect(once.colors.background).toBe("#ffffff"); // sibling key untouched
    expect(once.radius).toBe(4);

    unwrap(await h.call(ADMIN, "design.update", { colors: { background: "#111111" }, customCss: ":root{--x:1}" }));
    const twice = unwrap(await h.call(ADMIN, "design.get", {}));
    expect(twice.colors.accent).toBe("#ff0000"); // survives the second patch
    expect(twice.colors.background).toBe("#111111");
    expect(twice.radius).toBe(4);
    expect(twice.customCss).toBe(":root{--x:1}"); // stored verbatim
  });

  test("design does not leak into settings, and the public endpoint serves it", async () => {
    expect(unwrap(await h.call(ADMIN, "settings.get", {})).siteTitle).toBe("My Wove site");
    const res = await req("/api/public/design");
    expect(res.status).toBe(200);
    expect((await res.json()).colors.accent).toBe("#ff0000");
  });
});
