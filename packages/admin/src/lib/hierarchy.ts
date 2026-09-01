/**
 * Page hierarchy helpers — pure functions over a flat list of pages so they
 * can compute descendants, depth, tree order, and an optimistic public path
 * client-side (before core round-trips a saved `post.path`).
 *
 * Every function tolerates a cyclic `parentId` chain (shouldn't happen —
 * core rejects cycles on save — but a stale/partial fetch shouldn't hang
 * the UI) by bailing out once it has seen a node twice.
 */

export interface HierarchyNode {
  id: string;
  parentId: string | null;
  slug: string;
}

/** All descendant ids of `id` within `pages` (not including `id` itself). */
export function descendantIds(pages: HierarchyNode[], id: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const p of pages) {
    if (p.parentId == null) continue;
    const arr = childrenOf.get(p.parentId);
    if (arr) arr.push(p.id);
    else childrenOf.set(p.parentId, [p.id]);
  }

  const result: string[] = [];
  const seen = new Set<string>([id]);
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue; // cycle guard
    seen.add(next);
    result.push(next);
    for (const child of childrenOf.get(next) ?? []) stack.push(child);
  }
  return result;
}

/** Depth of `id` in its `parentId` chain (0 = top level / no parent, or unknown id). */
export function pageDepth(pages: HierarchyNode[], id: string): number {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let depth = 0;
  let current = byId.get(id);
  while (current?.parentId != null && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    depth++;
    current = parent;
  }
  return depth;
}

export interface TreeOrdered<T> {
  page: T;
  depth: number;
}

/**
 * Order pages as a tree: each parent immediately followed by its children
 * (recursively, depth-first), preserving the original relative order among
 * siblings and among top-level pages. Orphans (a `parentId` pointing at a
 * missing/foreign id) and cycles are treated as top-level so nothing gets
 * silently dropped.
 */
export function treeOrder<T extends HierarchyNode>(pages: T[]): TreeOrdered<T>[] {
  const ids = new Set(pages.map((p) => p.id));
  const byParent = new Map<string, T[]>();
  for (const p of pages) {
    if (p.parentId != null && ids.has(p.parentId)) {
      const arr = byParent.get(p.parentId);
      if (arr) arr.push(p);
      else byParent.set(p.parentId, [p]);
    }
  }

  const result: TreeOrdered<T>[] = [];
  const visited = new Set<string>();

  function visit(node: T, depth: number) {
    if (visited.has(node.id)) return; // cycle guard
    visited.add(node.id);
    result.push({ page: node, depth });
    for (const child of byParent.get(node.id) ?? []) visit(child, depth + 1);
  }

  for (const p of pages) {
    const isTopLevel = p.parentId == null || !ids.has(p.parentId);
    if (isTopLevel) visit(p, 0);
  }
  // Anything left unvisited only happens via a cycle with no top-level entry point.
  for (const p of pages) {
    if (!visited.has(p.id)) visit(p, 0);
  }
  return result;
}

/** "— " × depth prefix, for indenting an option label in a parent-page select. */
export function indentLabel(depth: number, label: string): string {
  return depth > 0 ? `${"— ".repeat(depth)}${label}` : label;
}

/**
 * Optimistic public path for a page, computed client-side from the slug
 * chosen and the parent it will be saved under — mirrors what core computes
 * for `post.path` once saved. Pages have no permalink prefix (unlike posts).
 */
export function previewPath(pages: HierarchyNode[], parentId: string | null, slug: string): string {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const segments: string[] = [];
  if (slug) segments.push(slug);

  const seen = new Set<string>();
  let current = parentId != null ? byId.get(parentId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.slug) segments.unshift(current.slug);
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }

  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}
