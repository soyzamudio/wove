import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, readDraft, shouldOffer, writeDraft } from "../lib/draftRecovery";

const AUTOSAVE_DELAY_MS = 2000;

export interface DraftRecovery<T> {
  /** A local draft newer than the server copy, if one exists. */
  recovered: T | null;
  /** When that draft was written locally (ISO). */
  recoveredAt: string | null;
  /** Take the recovered draft and stop offering it. */
  restore: () => T | null;
  /** Throw the recovered draft away. */
  discard: () => void;
  /** Drop the stored draft — call after a successful save. */
  clear: () => void;
}

/**
 * Debounced autosave of `state` into localStorage under `key`, plus a one-shot
 * recovery offer on mount when the stored draft is newer than `serverUpdatedAt`.
 *
 * The draft is only written once `enabled` is true, so the editor's empty
 * initial render never clobbers a real recovery record.
 */
export function useDraftRecovery<T>(
  key: string,
  state: T,
  options: { enabled: boolean; serverUpdatedAt?: string | null; delayMs?: number }
): DraftRecovery<T> {
  const { enabled, serverUpdatedAt, delayMs = AUTOSAVE_DELAY_MS } = options;

  // Read once per key, before any autosave can overwrite it.
  const [offer, setOffer] = useState<{ data: T; savedAt: string } | null>(null);
  const checkedKey = useRef<string | null>(null);

  useEffect(() => {
    if (checkedKey.current === key) return;
    checkedKey.current = key;
    const record = readDraft<T>(key);
    setOffer(record && shouldOffer(record.savedAt, serverUpdatedAt) ? { data: record.data, savedAt: record.savedAt } : null);
  }, [key, serverUpdatedAt]);

  // Debounced write.
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => writeDraft(key, state), delayMs);
    return () => clearTimeout(timer);
  }, [key, state, enabled, delayMs]);

  const restore = useCallback(() => {
    const data = offer?.data ?? null;
    setOffer(null);
    return data;
  }, [offer]);

  const discard = useCallback(() => {
    setOffer(null);
    clearDraft(key);
  }, [key]);

  const clear = useCallback(() => {
    setOffer(null);
    clearDraft(key);
  }, [key]);

  return { recovered: offer?.data ?? null, recoveredAt: offer?.savedAt ?? null, restore, discard, clear };
}
