import { describe, expect, test } from "bun:test";
import type { MenuItem } from "@agentpress/sdk";
import { blockRange, flatten, indent, move, outdent, remove, unflatten, updateItem, type FlatMenuItem } from "./menuTree";

const nested: MenuItem[] = [
  { id: "a", label: "A", href: "/a" },
  {
    id: "b",
    label: "B",
    href: "/b",
    children: [
      { id: "b1", label: "B1", href: "/b1" },
      { id: "b2", label: "B2", href: "/b2" },
    ],
  },
  { id: "c", label: "C", href: "/c" },
];

const flat = (...spec: Array<[string, 0 | 1]>): FlatMenuItem[] =>
  spec.map(([id, depth]) => ({ id, label: id.toUpperCase(), href: `/${id}`, depth }));

const shape = (items: FlatMenuItem[]) => items.map((i) => [i.id, i.depth] as const);

describe("flatten / unflatten", () => {
  test("flattens one nesting level with depths", () => {
    expect(shape(flatten(nested))).toEqual([
      ["a", 0],
      ["b", 0],
      ["b1", 1],
      ["b2", 1],
      ["c", 0],
    ]);
  });

  test("round-trips back to the nested shape", () => {
    expect(unflatten(flatten(nested))).toEqual(nested);
  });

  test("promotes a leading child that has no parent", () => {
    expect(unflatten(flat(["x", 1], ["y", 0]))).toEqual([
      { id: "x", label: "X", href: "/x" },
      { id: "y", label: "Y", href: "/y" },
    ]);
  });
});

describe("blockRange", () => {
  test("covers a parent and its children", () => {
    expect(blockRange(flatten(nested), "b")).toEqual({ start: 1, length: 3 });
  });

  test("covers only the item for a leaf or child", () => {
    expect(blockRange(flatten(nested), "a")).toEqual({ start: 0, length: 1 });
    expect(blockRange(flatten(nested), "b1")).toEqual({ start: 2, length: 1 });
  });

  test("returns null for an unknown id", () => {
    expect(blockRange(flatten(nested), "nope")).toBeNull();
  });
});

describe("move", () => {
  test("moves a leaf downward past a parent block", () => {
    expect(shape(move(flatten(nested), "a", "c"))).toEqual([
      ["b", 0],
      ["b1", 1],
      ["b2", 1],
      ["c", 0],
      ["a", 0],
    ]);
  });

  test("carries children along when a parent moves", () => {
    expect(shape(move(flatten(nested), "b", "a"))).toEqual([
      ["b", 0],
      ["b1", 1],
      ["b2", 1],
      ["a", 0],
      ["c", 0],
    ]);
  });

  test("is a no-op onto itself, into its own block, or for unknown ids", () => {
    const f = flatten(nested);
    expect(move(f, "a", "a")).toBe(f);
    expect(move(f, "b", "b1")).toBe(f);
    expect(move(f, "zzz", "a")).toBe(f);
    expect(move(f, "a", "zzz")).toBe(f);
  });

  test("promotes a child that ends up first", () => {
    expect(shape(move(flatten(nested), "b1", "a"))).toEqual([
      ["b1", 0],
      ["a", 0],
      ["b", 0],
      ["b2", 1],
      ["c", 0],
    ]);
  });
});

describe("indent / outdent", () => {
  test("indents a top-level leaf under the item above", () => {
    expect(shape(indent(flatten(nested), "c"))).toEqual([
      ["a", 0],
      ["b", 0],
      ["b1", 1],
      ["b2", 1],
      ["c", 1],
    ]);
  });

  test("refuses to indent the first item, a child, or a parent with children", () => {
    const f = flatten(nested);
    expect(indent(f, "a")).toBe(f);
    expect(indent(f, "b1")).toBe(f);
    expect(indent(f, "b")).toBe(f);
  });

  test("outdents a child in place", () => {
    expect(shape(outdent(flatten(nested), "b1"))).toEqual([
      ["a", 0],
      ["b", 0],
      ["b1", 0],
      ["b2", 1],
      ["c", 0],
    ]);
  });

  test("leaves top-level items and unknown ids alone", () => {
    const f = flatten(nested);
    expect(outdent(f, "a")).toBe(f);
    expect(outdent(f, "nope")).toBe(f);
  });
});

describe("remove", () => {
  test("removes a parent with all its children", () => {
    expect(shape(remove(flatten(nested), "b"))).toEqual([
      ["a", 0],
      ["c", 0],
    ]);
  });

  test("removes a single child", () => {
    expect(shape(remove(flatten(nested), "b1"))).toEqual([
      ["a", 0],
      ["b", 0],
      ["b2", 1],
      ["c", 0],
    ]);
  });

  test("is a no-op for an unknown id", () => {
    const f = flatten(nested);
    expect(remove(f, "nope")).toBe(f);
  });
});

describe("updateItem", () => {
  test("patches label and href of one item", () => {
    const next = updateItem(flatten(nested), "a", { label: "Home", href: "/" });
    expect(next[0]).toEqual({ id: "a", label: "Home", href: "/", depth: 0 });
    expect(next[1]!.label).toBe("B");
  });
});
