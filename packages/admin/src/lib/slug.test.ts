import { describe, expect, test } from "bun:test";
import { slugify } from "./slug";

describe("slugify", () => {
  test("lowercases and dashes spaces", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("strips punctuation and collapses separators", () => {
    expect(slugify("Café: A Story!! 2024")).toBe("cafe-a-story-2024");
  });

  test("trims leading/trailing dashes", () => {
    expect(slugify("  --Weird Title--  ")).toBe("weird-title");
  });
});
