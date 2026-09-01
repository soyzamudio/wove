import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { BlocksDoc } from "@wove/sdk";
import {
  blockIndex,
  builderReducer,
  canRedo,
  canUndo,
  initialBuilderState,
  type BuilderBlock,
  type BuilderState,
} from "../lib/builderState";

export interface BuilderApi {
  doc: BlocksDoc;
  blocks: BuilderBlock[];
  selectedId: string | null;
  selected: BuilderBlock | null;
  selectedIndex: number;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  select: (id: string | null) => void;
  insertAt: (index: number, block: BuilderBlock) => void;
  append: (block: BuilderBlock) => void;
  remove: (id: string) => void;
  move: (from: number, to: number) => void;
  moveBy: (id: string, delta: number) => void;
  duplicate: (id: string) => void;
  update: (id: string, props: unknown) => void;
  replaceBlock: (id: string, block: BuilderBlock) => void;
  replaceAll: (blocks: BuilderBlock[]) => void;
  reset: (doc: BlocksDoc) => void;
  markSaved: () => void;
  undo: () => void;
  redo: () => void;
}

/**
 * Builder document state: the blocks, the current selection, dirtiness and a
 * bounded undo/redo history. ⌘Z / ⇧⌘Z are wired up here (ignored while typing
 * in a field so native text undo keeps working).
 */
export function useBuilderState(initial?: BlocksDoc): BuilderApi {
  const [state, dispatch] = useReducer(
    builderReducer,
    initial,
    (doc?: BlocksDoc): BuilderState => initialBuilderState(doc)
  );

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const blocks = state.doc.blocks as unknown as BuilderBlock[];
  const selectedIndex = state.selectedId ? blockIndex(state.doc, state.selectedId) : -1;

  return useMemo<BuilderApi>(
    () => ({
      doc: state.doc,
      blocks,
      selectedId: state.selectedId,
      selected: selectedIndex >= 0 ? blocks[selectedIndex]! : null,
      selectedIndex,
      dirty: state.dirty,
      canUndo: canUndo(state),
      canRedo: canRedo(state),
      select: (id) => dispatch({ type: "select", id }),
      insertAt: (index, block) => dispatch({ type: "insertAt", index, block }),
      append: (block) => dispatch({ type: "insertAt", index: Number.MAX_SAFE_INTEGER, block }),
      remove: (id) => dispatch({ type: "remove", id }),
      move: (from, to) => dispatch({ type: "move", from, to }),
      moveBy: (id, delta) => dispatch({ type: "moveById", id, delta }),
      duplicate: (id) => dispatch({ type: "duplicate", id }),
      update: (id, props) => dispatch({ type: "update", id, props }),
      replaceBlock: (id, block) => dispatch({ type: "replaceBlock", id, block }),
      replaceAll: (newBlocks) => dispatch({ type: "replaceAll", blocks: newBlocks }),
      reset: (doc) => dispatch({ type: "reset", doc }),
      markSaved: () => dispatch({ type: "markSaved" }),
      undo,
      redo,
    }),
    [state, blocks, selectedIndex, undo, redo]
  );
}
