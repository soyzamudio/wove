import { createLocalDriver } from "./local";
import { createS3Driver, s3ConfigFromEnv } from "./s3";
import type { StorageDriver } from "./types";

export type { StorageDriver } from "./types";
export { createLocalDriver, mediaDir } from "./local";
export {
  createS3Driver, s3ConfigFromEnv, s3PublicBase, s3PublicUrl, StorageConfigError, type S3Config,
} from "./s3";

export function createStorage(env: Record<string, string | undefined> = process.env): StorageDriver {
  return env.WOVE_STORAGE === "s3" ? createS3Driver(s3ConfigFromEnv(env)) : createLocalDriver();
}

let cached: StorageDriver | undefined;

/** The process-wide driver, selected once from the environment at first use. */
export function storage(): StorageDriver {
  return (cached ??= createStorage());
}

/** Test hook: drop the memoised driver so the next call re-reads the environment. */
export function resetStorage(): void {
  cached = undefined;
}

