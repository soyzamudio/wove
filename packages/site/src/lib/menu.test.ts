import { describe, expect, test } from "bun:test";
import type { Menu } from "@agentpress/sdk";
import { resolveMenuItems } from "./menu";

describe("resolveMenuItems", () => {
  test("returns nested items unchanged when a menu exists for the location", () => {
    const menus: Menu[] = [
      {
        location: "header",
        name: "Header",
        items: [
          {
            id: "products",
            label: "Products",
            href: "/products",
            children: [{ id: "widgets", label: "Widgets", href: "/products/widgets" }],
          },
        ],
      },
    ];
    const items = resolveMenuItems(menus, "header");
    expect(items).toHaveLength(1);
    expect(items[0].children).toHaveLength(1);
    expect(items[0].children?.[0].label).toBe("Widgets");
  });

  test("falls back to Home/Blog when no header menu exists", () => {
    const items = resolveMenuItems([], "header");
    expect(items.map((i) => i.label)).toEqual(["Home", "Blog"]);
  });

  test("falls back when the menu exists but is empty", () => {
    const menus: Menu[] = [{ location: "header", name: "Header", items: [] }];
    const items = resolveMenuItems(menus, "header");
    expect(items.map((i) => i.label)).toEqual(["Home", "Blog"]);
  });

  test("footer fallback is an empty list", () => {
    expect(resolveMenuItems([], "footer")).toEqual([]);
  });
});
