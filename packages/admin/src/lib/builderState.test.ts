import { describe, expect, test } from "bun:test";
import type { BlocksDoc } from "@wove/sdk";
import {
  builderReducer,
  canRedo,
  canUndo,
  initialBuilderState,
  moveItem,
  type BuilderBlock,
  type BuilderState,
} from "./builderState";

function block(id: string, headline = id): BuilderBlock {
  return { id, type: "hero", props: { headline, buttons: [], layout: "split" } } as BuilderBlock;
}

function doc(...ids: string[]): BlocksDoc {
  return { version: 1, blocks: ids.map((id) => block(id)) as BlocksDoc["blocks"] };
}

const ids = (state: BuilderState) => state.doc.blocks.map((b) => b.id);

describe("moveItem", () => {
  test("moves forward and backward", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  test("clamps out-of-range targets and ignores no-ops", () => {
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    const items = ["a", "b"];
    expect(moveItem(items, 0, 0)).toBe(items);
    expect(moveItem(items, 5, 0)).toBe(items);
  });
});

describe("builderReducer", () => {
  test("insertAt places the block and selects it", () => {
    let state = initialBuilderState(doc("a", "c"));
    state = builderReducer(state, { type: "insertAt", index: 1, block: block("b") });
    expect(ids(state)).toEqual(["a", "b", "c"]);
    expect(state.selectedId).toBe("b");
    expect(state.dirty).toBe(true);
  });

  test("insertAt clamps the index", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "insertAt", index: 99, block: block("z") });
    expect(ids(state)).toEqual(["a", "z"]);
  });

  test("remove drops the block and re-selects a neighbour", () => {
    let state = initialBuilderState(doc("a", "b", "c"));
    state = builderReducer(state, { type: "select", id: "b" });
    state = builderReducer(state, { type: "remove", id: "b" });
    expect(ids(state)).toEqual(["a", "c"]);
    expect(state.selectedId).toBe("c");
  });

  test("remove of the last block clears selection when nothing follows", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "select", id: "a" });
    state = builderReducer(state, { type: "remove", id: "a" });
    expect(ids(state)).toEqual([]);
    expect(state.selectedId).toBe(null);
  });

  test("remove of an unknown id is a no-op", () => {
    const state = initialBuilderState(doc("a"));
    expect(builderReducer(state, { type: "remove", id: "nope" })).toBe(state);
  });

  test("move reorders by index", () => {
    let state = initialBuilderState(doc("a", "b", "c"));
    state = builderReducer(state, { type: "move", from: 2, to: 0 });
    expect(ids(state)).toEqual(["c", "a", "b"]);
  });

  test("moveById steps a block up or down and refuses to run off the ends", () => {
    let state = initialBuilderState(doc("a", "b", "c"));
    state = builderReducer(state, { type: "moveById", id: "c", delta: -1 });
    expect(ids(state)).toEqual(["a", "c", "b"]);
    const same = builderReducer(state, { type: "moveById", id: "a", delta: -1 });
    expect(same).toBe(state);
  });

  test("duplicate inserts a deep copy after the original with a fresh id", () => {
    let state = initialBuilderState(doc("a", "b"));
    state = builderReducer(state, { type: "duplicate", id: "a" });
    expect(state.doc.blocks).toHaveLength(3);
    const copy = state.doc.blocks[1]!;
    expect(copy.id).not.toBe("a");
    expect(state.selectedId).toBe(copy.id);
    expect((copy.props as any).headline).toBe("a");
    // deep copy: mutating the copy must not touch the original
    (copy.props as any).headline = "changed";
    expect((state.doc.blocks[0]!.props as any).headline).toBe("a");
  });

  test("update replaces props in place", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "update", id: "a", props: { headline: "new", buttons: [], layout: "split" } });
    expect((state.doc.blocks[0]!.props as any).headline).toBe("new");
  });

  test("replaceBlock keeps the original id", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "replaceBlock", id: "a", block: block("generated", "AI") });
    expect(state.doc.blocks[0]!.id).toBe("a");
    expect((state.doc.blocks[0]!.props as any).headline).toBe("AI");
  });

  test("replaceAll swaps the whole document", () => {
    let state = initialBuilderState(doc("a", "b"));
    state = builderReducer(state, { type: "replaceAll", blocks: [block("x"), block("y")] });
    expect(ids(state)).toEqual(["x", "y"]);
    expect(state.selectedId).toBe("x");
  });

  test("reset clears history and dirty", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "insertAt", index: 1, block: block("b") });
    state = builderReducer(state, { type: "reset", doc: doc("q") });
    expect(state.dirty).toBe(false);
    expect(canUndo(state)).toBe(false);
    expect(ids(state)).toEqual(["q"]);
  });

  test("markSaved clears dirty but keeps the document", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "insertAt", index: 1, block: block("b") });
    state = builderReducer(state, { type: "markSaved" });
    expect(state.dirty).toBe(false);
    expect(ids(state)).toEqual(["a", "b"]);
  });

  test("undo/redo walk the history stack", () => {
    let state = initialBuilderState(doc("a"));
    expect(canUndo(state)).toBe(false);
    expect(builderReducer(state, { type: "undo" })).toBe(state);

    state = builderReducer(state, { type: "insertAt", index: 1, block: block("b") });
    state = builderReducer(state, { type: "insertAt", index: 2, block: block("c") });
    expect(ids(state)).toEqual(["a", "b", "c"]);

    state = builderReducer(state, { type: "undo" });
    expect(ids(state)).toEqual(["a", "b"]);
    state = builderReducer(state, { type: "undo" });
    expect(ids(state)).toEqual(["a"]);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(true);

    state = builderReducer(state, { type: "redo" });
    expect(ids(state)).toEqual(["a", "b"]);
    state = builderReducer(state, { type: "redo" });
    expect(ids(state)).toEqual(["a", "b", "c"]);
    expect(canRedo(state)).toBe(false);
    expect(builderReducer(state, { type: "redo" })).toBe(state);
  });

  test("a new edit after undo clears the redo stack", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "insertAt", index: 1, block: block("b") });
    state = builderReducer(state, { type: "undo" });
    expect(canRedo(state)).toBe(true);
    state = builderReducer(state, { type: "insertAt", index: 1, block: block("z") });
    expect(canRedo(state)).toBe(false);
    expect(ids(state)).toEqual(["a", "z"]);
  });

  test("undo drops a selection that no longer exists", () => {
    let state = initialBuilderState(doc("a"));
    state = builderReducer(state, { type: "insertAt", index: 1, block: block("b") });
    expect(state.selectedId).toBe("b");
    state = builderReducer(state, { type: "undo" });
    expect(state.selectedId).toBe(null);
  });
});
