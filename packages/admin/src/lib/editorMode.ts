/**
 * Per-surface "wysiwyg vs raw markdown" preference, persisted in localStorage.
 * Pure + DOM-tolerant so it can be unit tested.
 */
export type EditorMode = "wysiwyg" | "markdown";

export function editorModeKey(surfaceId: string): string {
  return `wove:editor-mode:${surfaceId}`;
}

export function isEditorMode(value: unknown): value is EditorMode {
  return value === "wysiwyg" || value === "markdown";
}

export function readEditorMode(surfaceId: string, fallback: EditorMode = "wysiwyg"): EditorMode {
  try {
    const raw = globalThis.localStorage?.getItem(editorModeKey(surfaceId));
    return isEditorMode(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeEditorMode(surfaceId: string, mode: EditorMode): void {
  try {
    globalThis.localStorage?.setItem(editorModeKey(surfaceId), mode);
  } catch {
    /* private mode / SSR — the preference is a nicety, not a requirement. */
  }
}

/** Replace [start,end) of `text` with `replacement`; clamps out-of-range offsets. */
export function replaceRange(text: string, start: number, end: number, replacement: string): string {
  const lo = Math.max(0, Math.min(start, text.length));
  const hi = Math.max(lo, Math.min(end, text.length));
  return text.slice(0, lo) + replacement + text.slice(hi);
}

/** Markdown image snippet with the alt text escaped enough to stay parseable. */
export function imageMarkdown(url: string, alt = ""): string {
  const safeAlt = alt.replace(/[\[\]]/g, "");
  const safeUrl = /[\s()]/.test(url) ? `<${url}>` : url;
  return `![${safeAlt}](${safeUrl})`;
}
