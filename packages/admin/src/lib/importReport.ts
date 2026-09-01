import type { ImportJob } from "@wove/sdk";

export type ImportWarning = ImportJob["warnings"][number];

export interface WarningGroup {
  message: string;
  count: number;
  items: Array<string | null>;
}

/**
 * Groups warnings with the same message together (WordPress imports commonly
 * repeat the same failure across many items — e.g. "unsupported shortcode").
 * Sorted by count descending, then message for stable output.
 */
export function summarizeWarnings(warnings: ImportWarning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const w of warnings) {
    let group = groups.get(w.message);
    if (!group) {
      group = { message: w.message, count: 0, items: [] };
      groups.set(w.message, group);
    }
    group.count += 1;
    group.items.push(w.item);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.message.localeCompare(b.message));
}

/** Formats a millisecond duration as a short elapsed-time string, e.g. "42s", "3m 05s", "1h 02m". */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}
