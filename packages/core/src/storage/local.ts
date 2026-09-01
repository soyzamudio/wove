import { unlink } from "node:fs/promises";
import { join } from "node:path";
import type { StorageDriver } from "./types";

/** Filesystem root for locally stored media. Read lazily so tests can retarget it. */
export function mediaDir(): string {
  return process.env.AGENTPRESS_MEDIA_DIR ?? join(process.cwd(), "data", "media");
}

/** Stores objects under `./data/media/<key>`, served by the `/media/*` route. */
export function createLocalDriver(): StorageDriver {
  const publicUrl = (key: string) => `/media/${key}`;
  return {
    kind: "local",
    publicUrl,
    async put(key, bytes) {
      await Bun.write(join(mediaDir(), key), bytes);
      return { url: publicUrl(key) };
    },
    async delete(key) {
      await unlink(join(mediaDir(), key)).catch(() => {});
    },
  };
}
