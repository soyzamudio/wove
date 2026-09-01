import { describe, expect, test, beforeEach } from "bun:test";
import {
  editorModeKey,
  isEditorMode,
  readEditorMode,
  writeEditorMode,
  replaceRange,
  imageMarkdown,
} from "./editorMode";

beforeEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    /* no-op */
  }
});

describe("editorModeKey", () => {
  test("namespaces the surface id", () => {
    expect(editorModeKey("post-content")).toBe("wove:editor-mode:post-content");
  });
});

describe("isEditorMode", () => {
  test("accepts known modes", () => {
    expect(isEditorMode("wysiwyg")).toBe(true);
    expect(isEditorMode("markdown")).toBe(true);
  });

  test("rejects everything else", () => {
    expect(isEditorMode("html")).toBe(false);
    expect(isEditorMode(null)).toBe(false);
    expect(isEditorMode(undefined)).toBe(false);
    expect(isEditorMode(42)).toBe(false);
  });
});

describe("readEditorMode / writeEditorMode", () => {
  test("falls back to the default when nothing is stored", () => {
    expect(readEditorMode("fresh-surface")).toBe("wysiwyg");
    expect(readEditorMode("fresh-surface", "markdown")).toBe("markdown");
  });

  test("persists what was written", () => {
    writeEditorMode("post-content", "markdown");
    expect(readEditorMode("post-content")).toBe("markdown");
  });

  test("falls back when the stored value is garbage", () => {
    globalThis.localStorage?.setItem(editorModeKey("corrupt"), "not-a-mode");
    expect(readEditorMode("corrupt")).toBe("wysiwyg");
  });
});

describe("replaceRange", () => {
  test("replaces a middle span", () => {
    expect(replaceRange("hello world", 6, 11, "there")).toBe("hello there");
  });

  test("clamps out-of-range offsets", () => {
    expect(replaceRange("abc", -5, 100, "xyz")).toBe("xyz");
    expect(replaceRange("abc", 10, 20, "z")).toBe("abcz");
  });

  test("handles start > end by clamping end up to start", () => {
    expect(replaceRange("abcdef", 4, 1, "X")).toBe("abcdXef");
  });

  test("inserts at a collapsed position", () => {
    expect(replaceRange("abcdef", 3, 3, "-")).toBe("abc-def");
  });
});

describe("imageMarkdown", () => {
  test("builds a standard image snippet", () => {
    expect(imageMarkdown("https://example.com/a.png", "a cat")).toBe("![a cat](https://example.com/a.png)");
  });

  test("defaults alt text to empty", () => {
    expect(imageMarkdown("https://example.com/a.png")).toBe("![](https://example.com/a.png)");
  });

  test("strips brackets from alt text", () => {
    expect(imageMarkdown("https://example.com/a.png", "a [cat] jumping")).toBe(
      "![a cat jumping](https://example.com/a.png)"
    );
  });

  test("wraps urls containing whitespace or parens in angle brackets", () => {
    expect(imageMarkdown("https://example.com/a b.png")).toBe("![](<https://example.com/a b.png>)");
    expect(imageMarkdown("https://example.com/a(1).png")).toBe("![](<https://example.com/a(1).png>)");
  });
});
