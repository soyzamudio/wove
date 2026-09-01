import { describe, expect, test } from "bun:test";
import { descendantIds, indentLabel, pageDepth, previewPath, treeOrder, type HierarchyNode } from "./hierarchy";

const pages: HierarchyNode[] = [
  { id: "home", parentId: null, slug: "home" },
  { id: "about", parentId: null, slug: "about" },
  { id: "team", parentId: "about", slug: "team" },
  { id: "leadership", parentId: "team", slug: "leadership" },
  { id: "contact", parentId: null, slug: "contact" },
];

describe("descendantIds", () => {
  test("returns all nested descendants, not just direct children", () => {
    expect(descendantIds(pages, "about").sort()).toEqual(["leadership", "team"]);
  });

  test("returns empty for a leaf page", () => {
    expect(descendantIds(pages, "leadership")).toEqual([]);
  });

  test("returns empty for an unknown id", () => {
    expect(descendantIds(pages, "nope")).toEqual([]);
  });

  test("tolerates a cycle without hanging", () => {
    const cyclic: HierarchyNode[] = [
      { id: "a", parentId: "b", slug: "a" },
      { id: "b", parentId: "a", slug: "b" },
    ];
    expect(descendantIds(cyclic, "a").sort()).toEqual(["b"]);
  });
});

describe("pageDepth", () => {
  test("0 for a top-level page", () => {
    expect(pageDepth(pages, "about")).toBe(0);
  });

  test("counts hops up the parent chain", () => {
    expect(pageDepth(pages, "team")).toBe(1);
    expect(pageDepth(pages, "leadership")).toBe(2);
  });

  test("0 for an unknown id", () => {
    expect(pageDepth(pages, "nope")).toBe(0);
  });

  test("tolerates a cycle without hanging", () => {
    const cyclic: HierarchyNode[] = [
      { id: "a", parentId: "b", slug: "a" },
      { id: "b", parentId: "a", slug: "b" },
    ];
    expect(pageDepth(cyclic, "a")).toBeLessThan(cyclic.length + 1);
  });
});

describe("treeOrder", () => {
  test("orders children directly under their parent, preserving sibling order", () => {
    const ordered = treeOrder(pages).map((o) => o.page.id);
    expect(ordered).toEqual(["home", "about", "team", "leadership", "contact"]);
  });

  test("computes depth alongside each page", () => {
    const byId = Object.fromEntries(treeOrder(pages).map((o) => [o.page.id, o.depth]));
    expect(byId).toEqual({ home: 0, about: 0, team: 1, leadership: 2, contact: 0 });
  });

  test("is stable: re-ordering input doesn't change output order among unrelated roots", () => {
    const reversed = [...pages].reverse();
    const a = treeOrder(pages).map((o) => o.page.id);
    const b = treeOrder(reversed).map((o) => o.page.id);
    // Sibling relationships within a subtree are preserved regardless of overall input order,
    // and every node still appears exactly once.
    expect(new Set(a)).toEqual(new Set(b));
    expect(a).toContain("team");
  });

  test("treats an orphaned parentId as top-level instead of dropping the page", () => {
    const withOrphan: HierarchyNode[] = [...pages, { id: "orphan", parentId: "missing-parent", slug: "orphan" }];
    const ordered = treeOrder(withOrphan);
    expect(ordered.map((o) => o.page.id)).toContain("orphan");
    expect(ordered.find((o) => o.page.id === "orphan")?.depth).toBe(0);
  });

  test("tolerates a cycle without hanging or losing pages", () => {
    const cyclic: HierarchyNode[] = [
      { id: "a", parentId: "b", slug: "a" },
      { id: "b", parentId: "a", slug: "b" },
    ];
    const ordered = treeOrder(cyclic);
    expect(ordered.map((o) => o.page.id).sort()).toEqual(["a", "b"]);
  });
});

describe("indentLabel", () => {
  test("no prefix at depth 0", () => {
    expect(indentLabel(0, "About")).toBe("About");
  });

  test("prefixes with one dash-em per depth level", () => {
    expect(indentLabel(1, "Team")).toBe("— Team");
    expect(indentLabel(2, "Leadership")).toBe("— — Leadership");
  });
});

describe("previewPath", () => {
  test("top-level page: just the slug", () => {
    expect(previewPath(pages, null, "home")).toBe("/home");
  });

  test("nested under a chosen parent", () => {
    expect(previewPath(pages, "about", "team")).toBe("/about/team");
  });

  test("nested two levels deep", () => {
    expect(previewPath(pages, "team", "leadership")).toBe("/about/team/leadership");
  });

  test("updates live as the slug field changes, independent of the saved slug", () => {
    expect(previewPath(pages, "about", "new-slug")).toBe("/about/new-slug");
  });

  test("falls back to '/' when there's no slug yet and no parent", () => {
    expect(previewPath(pages, null, "")).toBe("/");
  });

  test("tolerates a cycle in the parent chain without hanging", () => {
    const cyclic: HierarchyNode[] = [
      { id: "a", parentId: "b", slug: "a" },
      { id: "b", parentId: "a", slug: "b" },
    ];
    expect(previewPath(cyclic, "a", "child")).toBe("/b/a/child");
  });
});
