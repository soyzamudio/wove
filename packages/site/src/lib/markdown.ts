import { marked } from "marked";
import { rewriteMediaUrls } from "./media";

marked.setOptions({ gfm: true, breaks: false });

/** Render trusted admin Markdown to HTML, then fix up relative media links. */
export function renderMarkdown(markdown: string, apiUrl: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return rewriteMediaUrls(html, apiUrl);
}
