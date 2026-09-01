// Tiny in-memory TTL cache so a burst of requests to the same public-API URL
// (e.g. several visitors hitting `/` at once) doesn't hammer core.
//
// NOTE: this is process-local and resets on deploy/restart. The cloud (hosted,
// multi-tenant) edition swaps this module for an edge/CDN cache (e.g. a
// Cloudflare Cache API or KV-backed layer) that is shared across instances and
// regions — the call sites in `api.ts` stay the same.

const TTL_MS = 10_000;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    return hit.value as T;
  }
  const value = await load();
  store.set(key, { value, expires: now + TTL_MS });
  return value;
}

/** Exposed for tests. */
export function clearCache(): void {
  store.clear();
}
