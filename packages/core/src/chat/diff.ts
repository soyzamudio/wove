/**
 * A small unified diff, good enough to review a proposed content change in the admin.
 * Line-based LCS; no external dependency, no rename/binary handling — this only ever
 * compares two strings that a human is about to approve.
 */
const CONTEXT = 3;

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      m[i]![j] = a[i] === b[j] ? m[i + 1]![j + 1]! + 1 : Math.max(m[i + 1]![j]!, m[i]![j + 1]!);
    }
  }
  return m;
}

type Op = { kind: " " | "-" | "+"; text: string };

function ops(a: string[], b: string[]): Op[] {
  const m = lcsMatrix(a, b);
  const out: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: " ", text: a[i]! });
      i++;
      j++;
    } else if (m[i + 1]![j]! >= m[i]![j + 1]!) {
      out.push({ kind: "-", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "+", text: b[j]! });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ kind: "-", text: a[i]! });
  for (; j < b.length; j++) out.push({ kind: "+", text: b[j]! });
  return out;
}

/** Unified diff of `before` → `after`; empty string when they are identical. */
export function unifiedDiff(before: string, after: string, label = "content"): string {
  if (before === after) return "";
  const a = before.split("\n");
  const b = after.split("\n");
  const all = ops(a, b);

  // Keep changed lines plus CONTEXT unchanged lines either side.
  const keep = new Set<number>();
  all.forEach((op, idx) => {
    if (op.kind === " ") return;
    for (let k = idx - CONTEXT; k <= idx + CONTEXT; k++) if (k >= 0 && k < all.length) keep.add(k);
  });

  const lines = [`--- ${label} (before)`, `+++ ${label} (after)`];
  let aLine = 0;
  let bLine = 0;
  let hunk: string[] = [];
  let hunkStart: { a: number; b: number } | null = null;
  let aCount = 0;
  let bCount = 0;

  const flush = () => {
    if (!hunkStart || hunk.length === 0) return;
    lines.push(`@@ -${hunkStart.a},${aCount} +${hunkStart.b},${bCount} @@`, ...hunk);
    hunk = [];
    hunkStart = null;
    aCount = 0;
    bCount = 0;
  };

  all.forEach((op, idx) => {
    const inHunk = keep.has(idx);
    if (inHunk) {
      if (!hunkStart) hunkStart = { a: aLine + 1, b: bLine + 1 };
      hunk.push(`${op.kind}${op.text}`);
      if (op.kind !== "+") aCount++;
      if (op.kind !== "-") bCount++;
    } else {
      flush();
    }
    if (op.kind !== "+") aLine++;
    if (op.kind !== "-") bLine++;
  });
  flush();
  return lines.join("\n");
}
