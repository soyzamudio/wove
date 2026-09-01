/**
 * Menu editing works on a *flat* list with a depth (0 or 1) — that's what
 * dnd-kit sorts naturally — and converts to/from the nested `MenuItem[]` the
 * `menu.set` tool expects. One nesting level only.
 */
import type { MenuItem } from "@agentpress/sdk";

export interface FlatMenuItem {
  id: string;
  label: string;
  href: string;
  /** 0 = top level, 1 = child of the nearest preceding depth-0 item. */
  depth: 0 | 1;
}

export function flatten(items: MenuItem[]): FlatMenuItem[] {
  const out: FlatMenuItem[] = [];
  for (const item of items) {
    out.push({ id: item.id, label: item.label, href: item.href, depth: 0 });
    for (const child of item.children ?? []) {
      out.push({ id: child.id, label: child.label, href: child.href, depth: 1 });
    }
  }
  return out;
}

export function unflatten(flat: FlatMenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of flat) {
    const node: MenuItem = { id: item.id, label: item.label, href: item.href };
    const parent = out[out.length - 1];
    // A depth-1 item with no parent above it is promoted to top level.
    if (item.depth === 1 && parent) {
      (parent.children ??= []).push(node);
    } else {
      out.push(node);
    }
  }
  return out;
}

/** Indices of an item plus (if it is a parent) its children — the block that moves together. */
export function blockRange(flat: FlatMenuItem[], id: string): { start: number; length: number } | null {
  const start = flat.findIndex((i) => i.id === id);
  if (start < 0) return null;
  let length = 1;
  if (flat[start]!.depth === 0) {
    while (flat[start + length]?.depth === 1) length++;
  }
  return { start, length };
}

/** Normalize: a depth-1 item can never be first. */
function normalize(flat: FlatMenuItem[]): FlatMenuItem[] {
  return flat.map((item, i) => (i === 0 && item.depth === 1 ? { ...item, depth: 0 as const } : item));
}

/** Move `activeId`'s block so it lands where `overId` currently sits. */
export function move(flat: FlatMenuItem[], activeId: string, overId: string): FlatMenuItem[] {
  if (activeId === overId) return flat;
  const range = blockRange(flat, activeId);
  if (!range) return flat;
  const overIndex = flat.findIndex((i) => i.id === overId);
  if (overIndex < 0) return flat;
  // Dropping inside the moving block itself is a no-op.
  if (overIndex >= range.start && overIndex < range.start + range.length) return flat;

  const block = flat.slice(range.start, range.start + range.length);
  const rest = [...flat.slice(0, range.start), ...flat.slice(range.start + range.length)];
  const target = rest.findIndex((i) => i.id === overId);
  const insertAt = overIndex > range.start ? target + 1 : target;
  return normalize([...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]);
}

/** Nest an item under the one above it. Only depth-0 items with no children can indent. */
export function indent(flat: FlatMenuItem[], id: string): FlatMenuItem[] {
  const index = flat.findIndex((i) => i.id === id);
  if (index <= 0) return flat;
  const item = flat[index]!;
  if (item.depth !== 0) return flat;
  if (flat[index + 1]?.depth === 1) return flat; // has children — can't nest a parent
  return flat.map((i, n) => (n === index ? { ...i, depth: 1 as const } : i));
}

/** Un-nest a child; it becomes a top-level item in place. */
export function outdent(flat: FlatMenuItem[], id: string): FlatMenuItem[] {
  const index = flat.findIndex((i) => i.id === id);
  if (index < 0) return flat;
  if (flat[index]!.depth !== 1) return flat;
  return flat.map((i, n) => (n === index ? { ...i, depth: 0 as const } : i));
}

/** Remove an item and, for a parent, everything nested under it. */
export function remove(flat: FlatMenuItem[], id: string): FlatMenuItem[] {
  const range = blockRange(flat, id);
  if (!range) return flat;
  return normalize([...flat.slice(0, range.start), ...flat.slice(range.start + range.length)]);
}

export function updateItem(flat: FlatMenuItem[], id: string, patch: Partial<Omit<FlatMenuItem, "id">>): FlatMenuItem[] {
  return flat.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

let seq = 0;
export function newItemId(): string {
  seq += 1;
  return `mi_${Date.now().toString(36)}_${seq.toString(36)}`;
}
