/**
 * Pure state machine behind the page builder canvas.
 *
 * Kept DOM- and React-free so it can be unit tested directly: `useBuilderState`
 * (src/hooks/useBuilderState.ts) is a thin `useReducer` wrapper over this.
 */
import type { BlocksDoc } from "@wove/sdk";
import type { AnyBlock } from "@wove/blocks";

export type BuilderBlock = AnyBlock;

export interface BuilderState {
  doc: BlocksDoc;
  selectedId: string | null;
  dirty: boolean;
  /** Previous docs, oldest first. Capped at HISTORY_LIMIT. */
  past: BlocksDoc[];
  /** Docs undone from, newest-undone first. */
  future: BlocksDoc[];
}

export type BuilderAction =
  /** Replace everything (post loaded from the server) — clears history + dirty. */
  | { type: "reset"; doc: BlocksDoc; selectedId?: string | null }
  | { type: "select"; id: string | null }
  | { type: "insertAt"; index: number; block: BuilderBlock; select?: boolean }
  | { type: "remove"; id: string }
  | { type: "move"; from: number; to: number }
  | { type: "moveById"; id: string; delta: number }
  | { type: "duplicate"; id: string }
  | { type: "update"; id: string; props: unknown }
  | { type: "replaceBlock"; id: string; block: BuilderBlock }
  | { type: "replaceAll"; blocks: BuilderBlock[]; select?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "markSaved" };

const HISTORY_LIMIT = 50;

export const emptyBuilderDoc = (): BlocksDoc => ({ version: 1, blocks: [] });

export function initialBuilderState(doc: BlocksDoc = emptyBuilderDoc()): BuilderState {
  return { doc, selectedId: null, dirty: false, past: [], future: [] };
}

export function canUndo(state: BuilderState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: BuilderState): boolean {
  return state.future.length > 0;
}

export function blockIndex(doc: BlocksDoc, id: string): number {
  return doc.blocks.findIndex((b) => b.id === id);
}

/** Clamp `to` into range and move the item at `from`. Returns a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(items.length - 1, to));
  if (target === from) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Short URL-safe id. Mirrors `newId` in @wove/blocks (duplicated so this file stays pure). */
export function builderId(size = 12): string {
  let out = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
    return out;
  }
  for (let i = 0; i < size; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
  return out;
}

/** Deep clone that works in every runtime we target. */
function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Apply a doc change, pushing the previous doc onto the undo stack. */
function commit(state: BuilderState, blocks: BuilderBlock[], selectedId: string | null = state.selectedId): BuilderState {
  const past = [...state.past, state.doc].slice(-HISTORY_LIMIT);
  return {
    doc: { ...state.doc, blocks: blocks as BlocksDoc["blocks"] },
    selectedId,
    dirty: true,
    past,
    future: [],
  };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  const blocks = state.doc.blocks as unknown as BuilderBlock[];

  switch (action.type) {
    case "reset":
      return {
        doc: action.doc,
        selectedId: action.selectedId ?? null,
        dirty: false,
        past: [],
        future: [],
      };

    case "select":
      if (state.selectedId === action.id) return state;
      return { ...state, selectedId: action.id };

    case "insertAt": {
      const index = Math.max(0, Math.min(blocks.length, action.index));
      const next = blocks.slice();
      next.splice(index, 0, action.block);
      return commit(state, next, action.select === false ? state.selectedId : action.block.id);
    }

    case "remove": {
      const index = blockIndex(state.doc, action.id);
      if (index < 0) return state;
      const next = blocks.filter((b) => b.id !== action.id);
      const selected =
        state.selectedId === action.id ? (next[index]?.id ?? next[index - 1]?.id ?? null) : state.selectedId;
      return commit(state, next, selected);
    }

    case "move": {
      const next = moveItem(blocks, action.from, action.to);
      if (next === blocks) return state;
      return commit(state, next);
    }

    case "moveById": {
      const from = blockIndex(state.doc, action.id);
      if (from < 0) return state;
      const to = from + action.delta;
      if (to < 0 || to >= blocks.length) return state;
      return commit(state, moveItem(blocks, from, to), action.id);
    }

    case "duplicate": {
      const index = blockIndex(state.doc, action.id);
      if (index < 0) return state;
      const copy = { ...clone(blocks[index]!), id: builderId() };
      const next = blocks.slice();
      next.splice(index + 1, 0, copy);
      return commit(state, next, copy.id);
    }

    case "update": {
      const index = blockIndex(state.doc, action.id);
      if (index < 0) return state;
      const next = blocks.slice();
      next[index] = { ...blocks[index]!, props: action.props } as BuilderBlock;
      return commit(state, next);
    }

    case "replaceBlock": {
      const index = blockIndex(state.doc, action.id);
      if (index < 0) return state;
      const next = blocks.slice();
      // Keep the existing id so selection and drag identity survive an AI edit.
      next[index] = { ...action.block, id: action.id } as BuilderBlock;
      return commit(state, next, action.id);
    }

    case "replaceAll":
      return commit(state, action.blocks, action.select === false ? null : (action.blocks[0]?.id ?? null));

    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1]!;
      return {
        doc: previous,
        selectedId: previous.blocks.some((b) => b.id === state.selectedId) ? state.selectedId : null,
        dirty: true,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0]!;
      return {
        doc: next,
        selectedId: next.blocks.some((b) => b.id === state.selectedId) ? state.selectedId : null,
        dirty: true,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }

    case "markSaved":
      return { ...state, dirty: false };

    default:
      return state;
  }
}
