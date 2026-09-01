import { describe, expect, test } from "bun:test";
import { relativeTime } from "./time";

describe("relativeTime", () => {
  const now = new Date("2026-01-01T12:00:00.000Z").getTime();

  test("returns 'just now' for very recent times", () => {
    expect(relativeTime("2026-01-01T11:59:58.000Z", now)).toBe("just now");
  });

  test("formats past times", () => {
    expect(relativeTime("2026-01-01T11:00:00.000Z", now)).toBe("1 hour ago");
  });

  test("formats future times", () => {
    expect(relativeTime("2026-01-01T13:00:00.000Z", now)).toBe("in 1 hour");
  });

  test("handles missing input", () => {
    expect(relativeTime(null)).toBe("—");
  });
});
