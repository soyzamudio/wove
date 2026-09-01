import { describe, expect, test } from "bun:test";
import { formatElapsed, summarizeWarnings } from "./importReport";

describe("summarizeWarnings", () => {
  test("groups identical messages and counts occurrences", () => {
    const groups = summarizeWarnings([
      { item: "post-1", message: "unsupported shortcode" },
      { item: "post-2", message: "unsupported shortcode" },
      { item: "post-3", message: "missing featured image" },
    ]);
    expect(groups).toEqual([
      { message: "unsupported shortcode", count: 2, items: ["post-1", "post-2"] },
      { message: "missing featured image", count: 1, items: ["post-3"] },
    ]);
  });

  test("sorts by count descending, then message ascending for ties", () => {
    const groups = summarizeWarnings([
      { item: "a", message: "z-message" },
      { item: "b", message: "a-message" },
    ]);
    expect(groups.map((g) => g.message)).toEqual(["a-message", "z-message"]);
  });

  test("handles null items and an empty list", () => {
    expect(summarizeWarnings([{ item: null, message: "site-level warning" }])).toEqual([
      { message: "site-level warning", count: 1, items: [null] },
    ]);
    expect(summarizeWarnings([])).toEqual([]);
  });
});

describe("formatElapsed", () => {
  test("formats sub-minute durations as seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(999)).toBe("0s");
    expect(formatElapsed(42_000)).toBe("42s");
  });

  test("formats minute-scale durations as m ss", () => {
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatElapsed(185_000)).toBe("3m 05s");
  });

  test("formats hour-scale durations as h mm", () => {
    expect(formatElapsed(3_725_000)).toBe("1h 02m");
  });

  test("treats negative or non-finite input as 0s", () => {
    expect(formatElapsed(-100)).toBe("0s");
    expect(formatElapsed(NaN)).toBe("0s");
  });
});
