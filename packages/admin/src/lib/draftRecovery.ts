/**
 * Local (per-browser) autosave of unsaved editor state, so a crash / accidental
 * navigation doesn't lose work. Pure helpers live here; the React wiring is in
 * `hooks/useDraftRecovery.ts`.
 */

export interface DraftRecord<T> {
  /** ISO timestamp of when the draft was written locally. */
  savedAt: string;
  data: T;
}

const PREFIX = "ap:draft:";

/** Storage key for a post/page editor: its id, or `new:<type>` before first save. */
export function draftKey(id: string | null | undefined, type: string): string {
  return `${PREFIX}${id && id !== "new" ? id : `new:${type}`}`;
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Should we offer to restore a local draft? Only when we have a valid local
 * timestamp and it is strictly newer than what the server last stored (a draft
 * for an unsaved post has no server time, so it always wins).
 */
export function shouldOffer(recoveredAt: string | null | undefined, serverUpdatedAt?: string | null): boolean {
  const local = timeOf(recoveredAt);
  if (local === null) return false;
  const server = timeOf(serverUpdatedAt);
  if (server === null) return true;
  return local > server;
}

export function readDraft<T>(key: string): DraftRecord<T> | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftRecord<T>;
    if (!parsed || typeof parsed.savedAt !== "string" || !("data" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T, now: Date = new Date()): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ savedAt: now.toISOString(), data } satisfies DraftRecord<T>));
  } catch {
    // storage full / disabled — autosave is best-effort
  }
}

export function clearDraft(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}
