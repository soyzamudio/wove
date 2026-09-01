import { describe, expect, test } from "bun:test";
import type { Settings } from "@agentpress/sdk";
import { formatLlmsFullTxt, formatLlmsTxt } from "./llms";

const settings: Settings = {
  siteTitle: "Test Site",
  tagline: "Testing tagline",
  siteUrl: "http://localhost:4321",
  theme: "default",
  postsPerPage: 10,
};

describe("formatLlmsTxt", () => {
  test("includes site title and tagline as header", () => {
    const out = formatLlmsTxt(settings, []);
    expect(out.startsWith("Test Site\nTesting tagline\n\n")).toBe(true);
  });

  test("formats each entry as a markdown link with absolute url and excerpt", () => {
    const out = formatLlmsTxt(settings, [{ slug: "hello-world", title: "Hello World", excerpt: "An intro." }]);
    expect(out).toContain("- [Hello World](http://localhost:4321/hello-world): An intro.");
  });

  test("omits the colon when there is no excerpt", () => {
    const out = formatLlmsTxt(settings, [{ slug: "about", title: "About", excerpt: null }]);
    expect(out).toContain("- [About](http://localhost:4321/about)");
    expect(out).not.toContain("About](http://localhost:4321/about):");
  });

  test("strips a trailing slash from siteUrl", () => {
    const out = formatLlmsTxt({ ...settings, siteUrl: "http://localhost:4321/" }, [
      { slug: "x", title: "X", excerpt: null },
    ]);
    expect(out).toContain("(http://localhost:4321/x)");
  });
});

describe("formatLlmsFullTxt", () => {
  test("concatenates full markdown bodies with # title headings", () => {
    const out = formatLlmsFullTxt(settings, [
      { title: "First", content: "Body one." },
      { title: "Second", content: "Body two." },
    ]);
    expect(out).toContain("# First\n\nBody one.");
    expect(out).toContain("# Second\n\nBody two.");
    expect(out.indexOf("# First")).toBeLessThan(out.indexOf("# Second"));
  });
});
