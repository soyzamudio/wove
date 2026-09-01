import type { Settings } from "@wove/sdk";

export interface LlmsEntry {
  /** The post's public path, e.g. "/blog/hello" or "/services/consulting". */
  path: string;
  title: string;
  excerpt: string | null;
}

function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Plain-text, AI-readable index of the site: title, tagline, then one line
 * per published page/post as `- [title](url): excerpt`.
 * Pure function (no I/O) so it's directly unit-testable.
 */
export function formatLlmsTxt(settings: Settings, entries: LlmsEntry[]): string {
  const lines = [settings.siteTitle, settings.tagline, ""];
  for (const entry of entries) {
    const url = absoluteUrl(settings.siteUrl, entry.path);
    const excerpt = entry.excerpt?.trim() ?? "";
    lines.push(`- [${entry.title}](${url})${excerpt ? `: ${excerpt}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

export interface LlmsFullEntry {
  title: string;
  content: string;
}

/**
 * Full Markdown bodies of every published page/post, concatenated with a
 * `# title` heading per entry. Pure function for unit testing.
 */
export function formatLlmsFullTxt(settings: Settings, entries: LlmsFullEntry[]): string {
  const header = [settings.siteTitle, settings.tagline, ""].join("\n");
  const body = entries.map((entry) => `# ${entry.title}\n\n${entry.content.trim()}\n`).join("\n");
  return `${header}\n${body}`;
}
