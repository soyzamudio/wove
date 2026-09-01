import { describe, expect, test } from "bun:test";
import { draftKey, shouldOffer } from "./draftRecovery";

describe("draftKey", () => {
  test("uses the post id when saved", () => {
    expect(draftKey("abc123", "post")).toBe("ap:draft:abc123");
  });

  test("falls back to new:<type> for unsaved editors", () => {
    expect(draftKey(null, "post")).toBe("ap:draft:new:post");
    expect(draftKey(undefined, "page")).toBe("ap:draft:new:page");
    expect(draftKey("new", "page")).toBe("ap:draft:new:page");
  });
});

describe("shouldOffer", () => {
  const server = "2026-01-10T10:00:00.000Z";

  test("offers when the local draft is newer than the server copy", () => {
    expect(shouldOffer("2026-01-10T10:05:00.000Z", server)).toBe(true);
  });

  test("does not offer when the server copy is newer or equal", () => {
    expect(shouldOffer("2026-01-10T09:55:00.000Z", server)).toBe(false);
    expect(shouldOffer(server, server)).toBe(false);
  });

  test("offers when there is no server copy yet (unsaved post)", () => {
    expect(shouldOffer("2026-01-10T10:00:00.000Z", null)).toBe(true);
    expect(shouldOffer("2026-01-10T10:00:00.000Z", undefined)).toBe(true);
  });

  test("never offers without a valid local timestamp", () => {
    expect(shouldOffer(null, server)).toBe(false);
    expect(shouldOffer(undefined, null)).toBe(false);
    expect(shouldOffer("not-a-date", null)).toBe(false);
  });

  test("ignores an unparseable server timestamp", () => {
    expect(shouldOffer("2026-01-10T10:00:00.000Z", "nonsense")).toBe(true);
  });
});
