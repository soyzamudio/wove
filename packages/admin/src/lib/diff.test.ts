import { describe, expect, test } from "bun:test";
import { diffStats, splitUnifiedDiff } from "./diff";

describe("splitUnifiedDiff", () => {
  test("returns no rows for empty/null input", () => {
    expect(splitUnifiedDiff(null)).toEqual([]);
    expect(splitUnifiedDiff(undefined)).toEqual([]);
    expect(splitUnifiedDiff("")).toEqual([]);
  });

  test("classifies hunk headers, additions, deletions and context", () => {
    const diff = ["@@ -1,3 +1,3 @@", " intro line", "-old title", "+new title", " outro"].join("\n");
    expect(splitUnifiedDiff(diff)).toEqual([
      { kind: "hunk", text: "@@ -1,3 +1,3 @@" },
      { kind: "ctx", text: "intro line" },
      { kind: "del", text: "old title" },
      { kind: "add", text: "new title" },
      { kind: "ctx", text: "outro" },
    ]);
  });

  test("treats file headers as hunk rows", () => {
    const rows = splitUnifiedDiff("--- a/post\n+++ b/post\n@@ -1 +1 @@\n-a\n+b");
    expect(rows.slice(0, 3).map((r) => r.kind)).toEqual(["hunk", "hunk", "hunk"]);
    expect(rows[3]).toEqual({ kind: "del", text: "a" });
    expect(rows[4]).toEqual({ kind: "add", text: "b" });
  });

  test("does not emit a phantom row for a trailing newline", () => {
    expect(splitUnifiedDiff("+a\n")).toEqual([{ kind: "add", text: "a" }]);
    // …but an intentional blank line inside the diff is kept.
    expect(splitUnifiedDiff("+a\n\n+b")).toHaveLength(3);
  });

  test("normalizes CRLF line endings", () => {
    expect(splitUnifiedDiff("+a\r\n-b\r\n")).toEqual([
      { kind: "add", text: "a" },
      { kind: "del", text: "b" },
    ]);
  });

  test("keeps empty added/removed lines as empty text", () => {
    expect(splitUnifiedDiff("+\n-")).toEqual([
      { kind: "add", text: "" },
      { kind: "del", text: "" },
    ]);
  });

  test("diffStats counts adds and removes only", () => {
    const rows = splitUnifiedDiff("@@ -1 +1 @@\n ctx\n-a\n-b\n+c");
    expect(diffStats(rows)).toEqual({ added: 1, removed: 2 });
  });
});
