import { describe, expect, test } from "bun:test";
import type { TemplateApplyReport } from "@wove/sdk";
import {
  inlineTemplateMedia,
  summarizeReport,
  templateFileName,
  templateFontLinks,
  validateTemplateFile,
} from "./templates";

const EMPTY_REPORT: TemplateApplyReport = {
  createdPages: [],
  overwrittenPages: [],
  skippedPages: [],
  createdPosts: [],
  menusSet: [],
  designApplied: false,
  settingsApplied: false,
  mediaUploaded: 0,
};

function report(patch: Partial<TemplateApplyReport>): TemplateApplyReport {
  return { ...EMPTY_REPORT, ...patch };
}

const VALID_TEMPLATE = {
  version: 1,
  meta: { slug: "studio", name: "Studio", description: "A portfolio", author: "Wove", templateVersion: "1.0.0" },
  design: {
    logo: null,
    colors: {
      accent: "#2563eb",
      background: "#ffffff",
      foreground: "#18181b",
      darkBackground: "#0a0a0a",
      darkForeground: "#f4f4f5",
    },
    fonts: { heading: "playfair", body: "inter" },
    radius: 12,
    customCss: "",
  },
  menus: [],
  pages: [
    {
      slug: "home",
      title: "Home",
      blocks: { version: 1, blocks: [{ id: "b1", type: "hero", props: { headline: "Hello", layout: "centered" } }] },
    },
  ],
  samplePosts: [],
  media: [],
};

describe("summarizeReport", () => {
  test("orders lines: pages, posts, menus, design, settings, media", () => {
    const lines = summarizeReport(
      report({
        createdPages: ["home", "about"],
        overwrittenPages: ["contact"],
        skippedPages: ["blog"],
        createdPosts: ["hello-world"],
        menusSet: ["header", "footer"],
        designApplied: true,
        settingsApplied: true,
        mediaUploaded: 3,
      })
    );
    expect(lines.map((l) => l.key)).toEqual([
      "createdPages",
      "overwrittenPages",
      "skippedPages",
      "createdPosts",
      "menusSet",
      "designApplied",
      "settingsApplied",
      "mediaUploaded",
    ]);
  });

  test("lists slugs and pluralizes", () => {
    const lines = summarizeReport(report({ createdPages: ["home", "about"], overwrittenPages: ["contact"] }));
    expect(lines[0]!.text).toBe("2 pages created — home, about");
    expect(lines[1]!.text).toBe("1 page overwritten — contact");
  });

  test("marks overwrites and site-wide changes amber, creations neutral", () => {
    const lines = summarizeReport(
      report({ createdPages: ["home"], overwrittenPages: ["about"], designApplied: true, settingsApplied: true })
    );
    expect(Object.fromEntries(lines.map((l) => [l.key, l.tone]))).toEqual({
      createdPages: "neutral",
      overwrittenPages: "amber",
      designApplied: "amber",
      settingsApplied: "amber",
    });
  });

  test("omits empty sections and falls back to a no-op line", () => {
    expect(summarizeReport(report({ mediaUploaded: 1 })).map((l) => l.key)).toEqual(["mediaUploaded"]);
    const empty = summarizeReport(EMPTY_REPORT);
    expect(empty).toHaveLength(1);
    expect(empty[0]!.key).toBe("noop");
    expect(empty[0]!.text).toContain("Nothing to change");
  });
});

describe("templateFontLinks", () => {
  test("returns Google Fonts hrefs for heading then body", () => {
    expect(templateFontLinks({ fonts: { heading: "playfair", body: "inter" } })).toEqual([
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap",
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    ]);
  });

  test("dedupes when heading and body share a face", () => {
    expect(templateFontLinks({ fonts: { heading: "lora", body: "lora" } })).toEqual([
      "https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&display=swap",
    ]);
  });

  test("system faces need no download", () => {
    expect(templateFontLinks({ fonts: { heading: "system", body: "system" } })).toEqual([]);
    expect(templateFontLinks({ fonts: { heading: "system", body: "geist" } })).toEqual([
      "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap",
    ]);
  });
});

describe("validateTemplateFile", () => {
  test("accepts a valid template and fills schema defaults", () => {
    const result = validateTemplateFile(JSON.stringify(VALID_TEMPLATE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.meta.slug).toBe("studio");
    expect(result.template.samplePosts).toEqual([]);
    expect(result.template.pages[0]!.blocks.blocks).toHaveLength(1);
  });

  test("reports unparseable JSON readably", () => {
    const result = validateTemplateFile("{ not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("Not valid JSON");
  });

  test("reports zod issues with dotted paths", () => {
    const bad = { ...VALID_TEMPLATE, meta: { ...VALID_TEMPLATE.meta, slug: "Not A Slug" }, pages: [] };
    const result = validateTemplateFile(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.startsWith("meta.slug:"))).toBe(true);
    expect(result.issues.some((i) => i.startsWith("pages:"))).toBe(true);
  });

  test("rejects a non-template JSON document", () => {
    const result = validateTemplateFile('{"hello":"world"}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("inlineTemplateMedia", () => {
  test("swaps template:// urls for data urls, deeply", () => {
    const doc = {
      version: 1 as const,
      blocks: [
        {
          id: "b1",
          type: "hero" as const,
          props: { headline: "Hi", layout: "split" as const, buttons: [], image: { url: "template://shot.png", alt: "" } },
        },
      ],
    };
    const out = inlineTemplateMedia(doc as any, [{ name: "shot.png", mime: "image/png", base64: "AAA" }]);
    expect((out.blocks[0]!.props as any).image.url).toBe("data:image/png;base64,AAA");
    // input untouched
    expect((doc.blocks[0]!.props as any).image.url).toBe("template://shot.png");
  });

  test("leaves unknown names and normal urls alone, and short-circuits with no media", () => {
    const doc = {
      version: 1 as const,
      blocks: [{ id: "b1", type: "image" as const, props: { image: { url: "template://missing.png", alt: "" } } }],
    };
    const out = inlineTemplateMedia(doc as any, [{ name: "other.png", mime: "image/png", base64: "AAA" }]);
    expect((out.blocks[0]!.props as any).image.url).toBe("template://missing.png");
    expect(inlineTemplateMedia(doc as any, [])).toBe(doc as any);
  });
});

describe("templateFileName", () => {
  test("slugifies the site title", () => {
    expect(templateFileName("My Great Site")).toBe("my-great-site-template.json");
    expect(templateFileName("  Café & Co.  ")).toBe("caf-co-template.json");
  });

  test("falls back when the title has no usable characters", () => {
    expect(templateFileName("")).toBe("site-template.json");
    expect(templateFileName("!!!")).toBe("site-template.json");
  });
});
