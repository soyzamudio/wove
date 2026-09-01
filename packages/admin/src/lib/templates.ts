import { FontMeta, SiteTemplate, type BlocksDoc, type Design, type TemplateApplyReport } from "@wove/sdk";

/**
 * Pure helpers behind the Templates page: turning an apply report into prose,
 * working out which Google Fonts a template needs, and validating an uploaded
 * template file. All DOM-free so they're directly unit-testable.
 */

export type ReportTone = "neutral" | "amber";

export interface ReportLine {
  /** Stable key for React lists / assertions. */
  key: string;
  /** Human-readable sentence, e.g. "3 pages created — home, about, pricing". */
  text: string;
  /** Overwrites are destructive: the UI renders those in amber. */
  tone: ReportTone;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function withSlugs(text: string, slugs: string[]): string {
  return slugs.length > 0 ? `${text} — ${slugs.join(", ")}` : text;
}

/**
 * Ordered, human-readable summary of a `template.preview` / `template.apply`
 * report. Lines that would not say anything ("0 pages created") are omitted;
 * an entirely empty report yields a single "nothing to do" line so the UI
 * never renders a blank summary.
 */
export function summarizeReport(report: TemplateApplyReport): ReportLine[] {
  const lines: ReportLine[] = [];

  if (report.createdPages.length > 0) {
    lines.push({
      key: "createdPages",
      text: withSlugs(`${plural(report.createdPages.length, "page")} created`, report.createdPages),
      tone: "neutral",
    });
  }
  if (report.overwrittenPages.length > 0) {
    lines.push({
      key: "overwrittenPages",
      text: withSlugs(`${plural(report.overwrittenPages.length, "page")} overwritten`, report.overwrittenPages),
      tone: "amber",
    });
  }
  if (report.skippedPages.length > 0) {
    lines.push({
      key: "skippedPages",
      text: withSlugs(
        `${plural(report.skippedPages.length, "page")} skipped (slug already exists)`,
        report.skippedPages
      ),
      tone: "neutral",
    });
  }
  if (report.createdPosts.length > 0) {
    lines.push({
      key: "createdPosts",
      text: withSlugs(`${plural(report.createdPosts.length, "sample post")} created`, report.createdPosts),
      tone: "neutral",
    });
  }
  if (report.menusSet.length > 0) {
    lines.push({
      key: "menusSet",
      text: withSlugs(`${plural(report.menusSet.length, "menu")} set`, report.menusSet),
      tone: "neutral",
    });
  }
  if (report.designApplied) {
    lines.push({ key: "designApplied", text: "Design applied (colors, fonts, radius)", tone: "amber" });
  }
  if (report.settingsApplied) {
    lines.push({ key: "settingsApplied", text: "Site title and tagline applied", tone: "amber" });
  }
  if (report.mediaUploaded > 0) {
    lines.push({
      key: "mediaUploaded",
      text: `${plural(report.mediaUploaded, "media file")} uploaded`,
      tone: "neutral",
    });
  }

  if (lines.length === 0) {
    lines.push({ key: "noop", text: "Nothing to change — your site already matches this template", tone: "neutral" });
  }
  return lines;
}

/**
 * Google Fonts stylesheet hrefs a template's design needs, deduped and in
 * heading-then-body order. System faces need no download and yield nothing.
 */
export function templateFontLinks(design: Pick<Design, "fonts">): string[] {
  const hrefs: string[] = [];
  for (const choice of [design.fonts.heading, design.fonts.body]) {
    const google = FontMeta[choice]?.google;
    if (!google) continue;
    const href = `https://fonts.googleapis.com/css2?family=${google}&display=swap`;
    if (!hrefs.includes(href)) hrefs.push(href);
  }
  return hrefs;
}

export type TemplateValidation =
  | { ok: true; template: SiteTemplate }
  | { ok: false; issues: string[] };

/**
 * Parse + validate the contents of an uploaded `.json` template file against
 * the SDK's `SiteTemplate` schema. Returns readable issue strings ("meta.slug:
 * kebab-case slug") rather than raw zod objects.
 */
export function validateTemplateFile(text: string): TemplateValidation {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, issues: [`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const parsed = SiteTemplate.safeParse(data);
  if (parsed.success) return { ok: true, template: parsed.data };

  const issues = parsed.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { ok: false, issues };
}

/**
 * Bundled template media is referenced from page blocks as `template://<name>`.
 * Nothing has been uploaded yet at preview time, so map those to inline data
 * URLs to make the preview truthful. Returns a new document; the input is
 * untouched.
 */
export function inlineTemplateMedia(doc: BlocksDoc, media: SiteTemplate["media"]): BlocksDoc {
  if (media.length === 0) return doc;
  const byName = new Map(media.map((m) => [m.name, `data:${m.mime};base64,${m.base64}`]));
  const swap = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (!value.startsWith("template://")) return value;
      return byName.get(value.slice("template://".length)) ?? value;
    }
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, swap(v)]));
    }
    return value;
  };
  return swap(doc) as BlocksDoc;
}

/** "My Great Site" → "my-great-site-template.json" (safe fallback when empty). */
export function templateFileName(siteTitle: string): string {
  const slug = siteTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "site"}-template.json`;
}
