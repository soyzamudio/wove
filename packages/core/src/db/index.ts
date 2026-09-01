import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as schema from "./schema";

export type DB = BunSQLiteDatabase<typeof schema>;
export { schema };

export const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "drizzle");

export function defaultDbPath(): string {
  return process.env.WOVE_DB ?? join(process.cwd(), "data", "wove.db");
}

/**
 * Open (creating if needed) a SQLite database and run pending migrations.
 * TODO(postgres): swap for `drizzle-orm/node-postgres` behind the same `DB` type
 * when `WOVE_DATABASE_URL` starts with `postgres://`. Not implemented in v1.
 */
/** Close the underlying SQLite handle. Safe to call more than once. */
export function closeDb(db: DB): void {
  try {
    (db as unknown as { $client?: { close?: () => void } }).$client?.close?.();
  } catch (e) {
    console.error("[db] close", (e as Error).message);
  }
}

export function openDb(path: string = defaultDbPath()): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}
