import { describe, expect, test } from "bun:test";
import type { BlocksDoc } from "@wove/sdk";

// `./collections` pulls in `./api`, which snapshots MOCK at import time; keep the
// whole test process on the mock fixtures (as `paths.test.ts` does).
process.env.MOCK = "1";
const { collectionSlugsIn } = await import("./collections");

const doc = (blocks: BlocksDoc["blocks"]): BlocksDoc => ({ version: 1, blocks });

const collectionBlock = (id: string, collection: string) =>
  ({ id, type: "collection", props: { collection, layout: "grid", columns: 3, limit: 6 } }) as BlocksDoc["blocks"][number];

describe("collectionSlugsIn", () => {
  test("returns nothing for empty, missing or collection-free documents", () => {
    expect(collectionSlugsIn(null)).toEqual([]);
    expect(collectionSlugsIn(undefined)).toEqual([]);
    expect(collectionSlugsIn(doc([]))).toEqual([]);
    expect(
      collectionSlugsIn(doc([{ id: "m", type: "markdown", props: { markdown: "hi", width: "content" } }])),
    ).toEqual([]);
  });

  test("collects slugs in document order and dedupes repeats", () => {
    const d = doc([
      collectionBlock("a", "team"),
      { id: "m", type: "markdown", props: { markdown: "hi", width: "content" } },
      collectionBlock("b", "events"),
      collectionBlock("c", "team"),
    ]);
    expect(collectionSlugsIn(d)).toEqual(["team", "events"]);
  });

  test("ignores blank slugs", () => {
    expect(collectionSlugsIn(doc([collectionBlock("a", "   ")]))).toEqual([]);
  });
});
