/**
 * Import job registry.
 *
 * Jobs live in memory while they run and are mirrored to `./data/imports/<id>.json`
 * after every phase, so `import.list` / `import.status` still answer after a restart.
 * There is no schema migration: this is deliberately a side file, not a table.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ImportJob } from "@wove/sdk";
import { mediaDir } from "../storage";

export const MAX_LISTED_JOBS = 20;

/** `WOVE_IMPORTS_DIR`, else a sibling of the media dir (so tests inherit the temp dir). */
export function importsDir(): string {
  return process.env.WOVE_IMPORTS_DIR ?? join(dirname(mediaDir()), "imports");
}

const memory = new Map<string, ImportJob>();

export function emptyJob(id: string): ImportJob {
  return {
    id,
    status: "queued",
    phase: "queued",
    progress: { done: 0, total: 0 },
    counts: { posts: 0, pages: 0, media: 0, terms: 0, menus: 0, skipped: 0, failed: 0 },
    warnings: [],
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    source: { siteTitle: null, siteUrl: null, items: 0 },
  };
}

/** Persist to memory + disk. Disk failures never break an import. */
export function saveJob(job: ImportJob): ImportJob {
  memory.set(job.id, job);
  try {
    const dir = importsDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${job.id}.json`), JSON.stringify(job, null, 2));
  } catch (e) {
    console.warn("[import] could not persist job", job.id, (e as Error).message);
  }
  return job;
}

function readFromDisk(id: string): ImportJob | null {
  try {
    const parsed = ImportJob.safeParse(JSON.parse(readFileSync(join(importsDir(), `${id}.json`), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function getJob(id: string): ImportJob | null {
  return memory.get(id) ?? readFromDisk(id);
}

/** Newest first, capped at `MAX_LISTED_JOBS`. Memory wins over the on-disk copy. */
export function listJobs(limit = MAX_LISTED_JOBS): ImportJob[] {
  const byId = new Map<string, ImportJob>();
  try {
    for (const name of readdirSync(importsDir())) {
      if (!name.endsWith(".json")) continue;
      const job = readFromDisk(name.slice(0, -".json".length));
      if (job) byId.set(job.id, job);
    }
  } catch {
    // no imports directory yet
  }
  for (const [id, job] of memory) byId.set(id, job);
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

/** Test hook: forget in-memory jobs. */
export function resetJobs(): void {
  memory.clear();
}
