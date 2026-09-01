/**
 * Minimal unified-diff splitter for rendering `ChatToolCall.preview.diff` in the
 * site-chat approval cards. Pure + dependency-free so it's directly testable.
 */

export type DiffRowKind = "add" | "del" | "ctx" | "hunk";

export interface DiffRow {
  kind: DiffRowKind;
  /** The line with its unified-diff marker stripped (hunk headers keep theirs). */
  text: string;
}

/**
 * Split a unified diff into renderable rows.
 *
 * - `@@ … @@` hunk headers (and `---`/`+++`/`diff --git`/`index` file headers)
 *   become `hunk` rows, kept verbatim so the reader sees the context.
 * - `+`/`-` lines become `add`/`del` with the marker stripped.
 * - everything else is `ctx` (a leading space, per the spec, is stripped).
 *
 * An empty/blank diff yields no rows. Trailing newlines never produce a
 * phantom final row.
 */
export function splitUnifiedDiff(diff: string | null | undefined): DiffRow[] {
  if (!diff) return [];
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  // A single trailing newline shouldn't render as an empty context row.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const rows: DiffRow[] = [];
  for (const line of lines) {
    if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      rows.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+")) {
      rows.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "del", text: line.slice(1) });
    } else {
      rows.push({ kind: "ctx", text: line.startsWith(" ") ? line.slice(1) : line });
    }
  }
  return rows;
}

/** Counts for the "+N −M" summary shown on a diff block's header. */
export function diffStats(rows: DiffRow[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.kind === "add") added++;
    else if (r.kind === "del") removed++;
  }
  return { added, removed };
}
