import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BACKUPS_DIRNAME,
  LAST_RUN_VERSION_KEY,
  backupBeforeMigrate,
  isMainDbPath,
  preUpgradeBackupEnabled,
  pruneBackups,
  readLastRunVersion,
  recordRunVersion,
  stamp,
} from "./backup";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "wove-backup-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A db that looks like a migrated Wove install sitting at `version`. */
function seedDb(path: string, version: string | null): void {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT)`);
  db.run(`INSERT INTO posts (id, title) VALUES ('p1', 'hello')`);
  if (version !== null) recordRunVersion(db, version);
  db.close();
}

describe("isMainDbPath", () => {
  test("only the configured database counts", () => {
    expect(isMainDbPath("/srv/data/wove.db", { WOVE_DB: "/srv/data/wove.db" })).toBe(true);
    expect(isMainDbPath("/tmp/wove-test-x/test.db", { WOVE_DB: "/srv/data/wove.db" })).toBe(false);
    expect(isMainDbPath(":memory:", {})).toBe(false);
    expect(isMainDbPath(join(process.cwd(), "data", "wove.db"), {})).toBe(true);
  });
});

describe("readLastRunVersion", () => {
  test("reads the stored value", () => {
    const p = join(tmp(), "wove.db");
    seedDb(p, "0.1.0");
    expect(readLastRunVersion(p)).toBe("0.1.0");
  });

  test("a database with no settings table returns null instead of throwing", () => {
    const p = join(tmp(), "wove.db");
    const db = new Database(p, { create: true });
    db.exec(`CREATE TABLE only_this (x INTEGER)`);
    db.close();
    expect(readLastRunVersion(p)).toBeNull();
  });

  test("a missing file returns null", () => {
    expect(readLastRunVersion(join(tmp(), "nope.db"))).toBeNull();
  });

  test("a settings table with no row returns null", () => {
    const p = join(tmp(), "wove.db");
    seedDb(p, null);
    expect(readLastRunVersion(p)).toBeNull();
  });
});

describe("backupBeforeMigrate", () => {
  test("copies the db aside when the version changed", () => {
    const dir = tmp();
    const p = join(dir, "wove.db");
    seedDb(p, "0.1.0");
    const dest = backupBeforeMigrate(p, "0.2.0", {}, new Date(2026, 8, 1));
    expect(dest).toBe(join(dir, BACKUPS_DIRNAME, "pre-0.2.0-20260901.db"));
    expect(existsSync(dest!)).toBe(true);
    // the copy is a usable database, not a truncated file
    const copy = new Database(dest!, { create: false, readwrite: true });
    expect((copy.query(`SELECT title FROM posts WHERE id='p1'`).get() as any).title).toBe("hello");
    copy.close();
  });

  test("does nothing when the version is unchanged", () => {
    const dir = tmp();
    const p = join(dir, "wove.db");
    seedDb(p, "0.2.0");
    expect(backupBeforeMigrate(p, "0.2.0", {})).toBeNull();
    expect(existsSync(join(dir, BACKUPS_DIRNAME))).toBe(false);
  });

  test("a fresh database (no settings table) backs up nothing and does not throw", () => {
    const dir = tmp();
    const p = join(dir, "wove.db");
    const db = new Database(p, { create: true });
    db.close();
    expect(backupBeforeMigrate(p, "0.2.0", {})).toBeNull();
    expect(existsSync(join(dir, BACKUPS_DIRNAME))).toBe(false);
  });

  test("a database file that does not exist yet backs up nothing", () => {
    const dir = tmp();
    expect(backupBeforeMigrate(join(dir, "wove.db"), "0.2.0", {})).toBeNull();
    expect(existsSync(join(dir, BACKUPS_DIRNAME))).toBe(false);
  });

  test("WOVE_PREUPGRADE_BACKUP=0 disables it", () => {
    const dir = tmp();
    const p = join(dir, "wove.db");
    seedDb(p, "0.1.0");
    expect(preUpgradeBackupEnabled({ WOVE_PREUPGRADE_BACKUP: "0" })).toBe(false);
    expect(backupBeforeMigrate(p, "0.2.0", { WOVE_PREUPGRADE_BACKUP: "0" })).toBeNull();
    expect(existsSync(join(dir, BACKUPS_DIRNAME))).toBe(false);
  });

  test("keeps only the 3 newest backups", () => {
    const dir = tmp();
    const p = join(dir, "wove.db");
    seedDb(p, "0.0.1");
    const days = ["0.0.2", "0.0.3", "0.0.4", "0.0.5", "0.0.6"];
    for (let i = 0; i < days.length; i++) {
      backupBeforeMigrate(p, days[i]!, {}, new Date(2026, 0, i + 1));
      recordRunVersion(openWritable(p), days[i]!);
    }
    const kept = readdirSync(join(dir, BACKUPS_DIRNAME)).sort();
    expect(kept.length).toBe(3);
    expect(kept).toEqual(["pre-0.0.4-20260103.db", "pre-0.0.5-20260104.db", "pre-0.0.6-20260105.db"]);
  });
});

function openWritable(p: string): Database {
  return new Database(p, { create: false, readwrite: true });
}

describe("pruneBackups", () => {
  test("keeps the newest N and ignores unrelated files", () => {
    const dir = tmp();
    for (const n of ["pre-0.1.0-20260101.db", "pre-0.2.0-20260102.db", "pre-0.3.0-20260103.db", "pre-0.4.0-20260104.db"]) {
      writeFileSync(join(dir, n), "x");
    }
    writeFileSync(join(dir, "notes.txt"), "keep me");
    pruneBackups(dir, 2);
    const left = readdirSync(dir).sort();
    expect(left).toEqual(["notes.txt", "pre-0.3.0-20260103.db", "pre-0.4.0-20260104.db"]);
  });

  test("a missing directory is not an error", () => {
    expect(pruneBackups(join(tmp(), "nope"))).toEqual([]);
  });
});

describe("recordRunVersion", () => {
  test("inserts then updates the same row", () => {
    const p = join(tmp(), "wove.db");
    seedDb(p, "0.1.0");
    const db = openWritable(p);
    recordRunVersion(db, "0.2.0");
    const rows = db.query(`SELECT key, value FROM settings WHERE key = ?`).all(LAST_RUN_VERSION_KEY);
    expect(rows.length).toBe(1);
    db.close();
    expect(readLastRunVersion(p)).toBe("0.2.0");
  });

  test("a db without a settings table logs rather than throws", () => {
    const p = join(tmp(), "wove.db");
    const db = new Database(p, { create: true });
    expect(() => recordRunVersion(db, "0.2.0")).not.toThrow();
    db.close();
  });
});

describe("stamp", () => {
  test("is yyyymmdd, zero padded", () => {
    expect(stamp(new Date(2026, 8, 1))).toBe("20260901");
    expect(stamp(new Date(2026, 11, 25))).toBe("20261225");
  });
});
