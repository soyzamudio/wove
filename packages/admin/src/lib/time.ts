/** Format an ISO date string as a short relative time, e.g. "5m ago", "in 3h". */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = then - now;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);

  const units: Array<[string, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];

  if (abs < 5) return "just now";

  for (const [unit, secs] of units) {
    if (abs >= secs || unit === "second") {
      const value = Math.round(diffSec / secs);
      if (value === 0) continue;
      const plural = Math.abs(value) === 1 ? unit : `${unit}s`;
      return value < 0 ? `${Math.abs(value)} ${plural} ago` : `in ${value} ${plural}`;
    }
  }
  return "just now";
}
