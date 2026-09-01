/**
 * Pre-migration backup.
 *
 * Migrations are one-way. Before the first boot on a new version touches the schema we
 * take a copy of the database file, so an upgrade that goes wrong can be undone by
 * restoring a file rather than by restoring a person's evening.
 *
 * Runs only for the real on-disk database (never `:memory:` or a test temp dir), only
 * when the stored `system.lastRunVersion` differs from the running version, and only
 * when there is actually a file to copy. `WOVE_PREUPGRADE_BACKUP=0` disables it.
 */
import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Env } from "../env";

export const LAST_RUN_VERSION_KEY = "system.lastRunVersion";
export const BACKUPS_DIRNAME = "backups";
/** How many pre-upgrade backups to keep. Older ones are pruned. */
export const KEEP_BACKUPS = 3;

export const preUpgradeBackupEnabled = (env: Env = process.env) =>
  env.WOVE_PREUPGRADE_BACKUP !== "0";

/**
 * True when `path` is the database this install is actually configured to use. Test
 * harnesses open databases in temp dirs; those must never be backed up.
 */
export function isMainDbPath(path: string, env: Env = process.env): boolean {
  if (path === ":memory:" || path === "") return false;
  const configured = env.WOVE_DB ?? join(process.cwd(), "data", "wove.db");
  return path === configured;
}

/**
 * Read `system.lastRunVersion` with a raw SELECT. On a brand-new database the settings
 * table does not exist yet — that throws, and a fresh database has nothing to back up.
 */
export function readLastRunVersion(path: string): string | null {
  let db: Database | null = null;
  try {
    try {
      db = new Database(path, { create: false, readonly: true });
    } catch {
      // A WAL database with no -shm yet cannot always be opened read-only.
      db = new Database(path, { create: false, readwrite: true });
    }
    const row = db
      .query(`SELECT value FROM settings WHERE key = ?`)
      .get(LAST_RUN_VERSION_KEY) as { value?: unknown } | null;
    if (!row || row.value == null) return null;
    const raw = String(row.value);
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : raw;
    } catch {
      return raw;
    }
  } catch {
    // no file, no settings table, or an unreadable db — treat as "nothing recorded"
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/** `20260901` — sortable, and readable in a directory listing. */
export function stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
}

/** Delete all but the `keep` newest `pre-*.db` files in `dir`. Returns removed names. */
export function pruneBackups(dir: string, keep = KEEP_BACKUPS): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.startsWith("pre-") && n.endsWith(".db"));
  } catch {
    return [];
  }
  const sorted = names
    .map((name) => {
      let mtime = 0;
      try {
        mtime = statSync(join(dir, name)).mtimeMs;
      } catch {
        /* ignore */
      }
      return { name, mtime };
    })
    // newest first; name is the tiebreak so same-second writes still order stably
    .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  const removed: string[] = [];
  for (const { name } of sorted.slice(keep)) {
    try {
      unlinkSync(join(dir, name));
      removed.push(name);
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/**
 * Copy the database aside if the running version differs from the last recorded one.
 * Returns the backup path, or null when nothing was (or needed to be) copied.
 * Never throws: a failed backup logs and lets boot continue.
 */
export function backupBeforeMigrate(
  path: string,
  currentVersion: string,
  env: Env = process.env,
  now = new Date(),
): string | null {
  if (!preUpgradeBackupEnabled(env)) return null;
  if (!existsSync(path)) return null; // fresh install — nothing to protect
  const last = readLastRunVersion(path);
  if (last === null) return null; // no settings table / never recorded = fresh db
  if (last === currentVersion) return null;

  try {
    // Fold the WAL back into the main file so a single-file copy is complete.
    const tmp = new Database(path, { create: false, readwrite: true });
    try {
      tmp.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } finally {
      tmp.close();
    }

    const dir = join(dirname(path), BACKUPS_DIRNAME);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `pre-${currentVersion}-${stamp(now)}.db`);
    copyFileSync(path, dest);
    pruneBackups(dir);
    console.log(`[db] backed up wove.db → ${BACKUPS_DIRNAME}/${dest.split("/").pop()}`);
    return dest;
  } catch (e) {
    console.warn(`[db] pre-upgrade backup failed: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Record the version that has now successfully migrated this database.
 * Accepts either a drizzle handle or a raw `bun:sqlite` Database.
 */
export function recordRunVersion(db: unknown, version: string): void {
  try {
    const handle = db as { $client?: Database };
    const sqlite: Database = handle?.$client ?? (db as Database);
    sqlite.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [LAST_RUN_VERSION_KEY, JSON.stringify(version), new Date().toISOString()],
    );
  } catch (e) {
    console.warn(`[db] could not record ${LAST_RUN_VERSION_KEY}: ${(e as Error).message}`);
  }
}
