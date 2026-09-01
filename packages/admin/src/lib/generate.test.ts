import { describe, expect, test } from "bun:test";
import { chipPrompt, chipsFor, PAGE_CHIPS, POST_CHIPS } from "./generate";

describe("chipPrompt", () => {
  test("uses the template alone for an empty prompt", () => {
    expect(chipPrompt("", "Write an announcement post about ")).toBe("Write an announcement post about ");
    expect(chipPrompt("   ", "Write an announcement post about ")).toBe("Write an announcement post about ");
  });

  test("prefixes existing text with a single space", () => {
    expect(chipPrompt("our new editor", "Write an announcement post about ")).toBe(
      "Write an announcement post about our new editor"
    );
    expect(chipPrompt("   our new editor", "Write an announcement post about ")).toBe(
      "Write an announcement post about our new editor"
    );
  });

  test("does not duplicate a prefix that is already there", () => {
    const once = chipPrompt("our new editor", "Write an announcement post about ");
    expect(chipPrompt(once, "Write an announcement post about ")).toBe(once);
  });

  test("prefix match is case-insensitive", () => {
    expect(chipPrompt("write an announcement post about x", "Write an announcement post about ")).toBe(
      "write an announcement post about x"
    );
  });

  test("swapping chips replaces nothing — it prefixes the other template", () => {
    expect(chipPrompt("Write a listicle about tools", "Write release notes for ")).toBe(
      "Write release notes for Write a listicle about tools"
    );
  });
});

describe("chipsFor", () => {
  test("posts and pages get different chip lists", () => {
    const posts = chipsFor("post");
    const pages = chipsFor("page");
    expect(posts).toBe(POST_CHIPS);
    expect(pages).toBe(PAGE_CHIPS);
    expect(posts.map((c) => c.label)).not.toEqual(pages.map((c) => c.label));
    for (const chip of [...posts, ...pages]) {
      expect(chip.template.endsWith(" ")).toBe(true);
      expect(chip.label.length).toBeGreaterThan(0);
    }
  });

  test("expected labels per mode", () => {
    expect(chipsFor("post").map((c) => c.label)).toEqual([
      "Announcement",
      "How-to guide",
      "Release notes",
      "Opinion piece",
      "Listicle",
    ]);
    expect(chipsFor("page").map((c) => c.label)).toEqual([
      "Landing page",
      "About page",
      "Pricing page",
      "FAQ page",
      "Contact page",
    ]);
  });
});
