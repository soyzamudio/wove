/**
 * The running version, read from `packages/core/package.json` at import time so there is
 * exactly one place a release bumps (the package manifest) and no hardcoded copy to
 * forget. Falls back to "0.0.0" if the manifest is unreadable (e.g. an exotic bundle).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readVersion(): string {
  try {
    const raw = readFileSync(join(import.meta.dir, "..", "package.json"), "utf8");
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === "string" && v.length > 0 ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION: string = readVersion();
