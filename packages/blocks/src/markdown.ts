import { marked } from "marked";

/** Render Markdown to an HTML string, synchronously (SSR-safe). */
export function renderMarkdown(md: string | undefined | null): string {
  if (!md) return "";
  return marked.parse(String(md), { async: false, gfm: true, breaks: false }) as string;
}
