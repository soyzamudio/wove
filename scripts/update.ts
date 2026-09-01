#!/usr/bin/env bun
/**
 * In-place updater for git installs (VPS / bare-metal). Docker installs update
 * with `docker compose pull && docker compose up -d` instead — see docs/DEPLOY.md.
 *
 * Usage:
 *   bun run update            # move to the newest v* tag, install, build
 *   bun run update --check    # only report whether an update is available
 *
 * What it does: verifies a clean working tree, fetches tags from origin, finds
 * the newest `v*` tag, prints the changelog delta, checks that tag out, then
 * runs `bun install` and `bun run build`.
 *
 * What it does NOT do: touch the database. Drizzle migrations run automatically
 * on the next boot, and Wove takes a pre-upgrade backup of the SQLite file into
 * `data/backups/` before applying them. Nothing here is destructive to data.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function run(args: string[], opts: { allowFail?: boolean } = {}): string {
  const p = Bun.spawnSync(args, { cwd: ROOT, stderr: "pipe", stdout: "pipe" });
  if (p.exitCode !== 0 && !opts.allowFail) {
    console.error(`\nupdate: command failed: ${args.join(" ")}\n${p.stderr.toString().trim()}`);
    process.exit(1);
  }
  return p.stdout.toString().trim();
}

function runInherit(args: string[]): void {
  const p = Bun.spawnSync(args, { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
  if (p.exitCode !== 0) {
    console.error(`\nupdate: command failed: ${args.join(" ")}`);
    process.exit(1);
  }
}

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const unknown = argv.filter((a) => a !== "--check");
if (unknown.length) {
  console.error(`update: unknown argument(s): ${unknown.join(", ")}\nusage: bun run update [--check]`);
  process.exit(1);
}

// A dirty tree would be clobbered by `git checkout <tag>`, so refuse early.
// `--check` is read-only, so it tolerates local edits.
const dirty = run(["git", "status", "--porcelain"]).split("\n").filter(Boolean);
if (dirty.length && !checkOnly) {
  console.error(
    `\nupdate: working tree is not clean — commit or stash these first:\n  ${dirty
      .slice(0, 20)
      .join("\n  ")}${dirty.length > 20 ? `\n  … and ${dirty.length - 20} more` : ""}\n`,
  );
  process.exit(1);
}

console.log("fetching tags from origin…");
run(["git", "fetch", "--tags", "origin"]);

const tags = run(["git", "tag", "--list", "v*", "--sort=-v:refname"]).split("\n").filter(Boolean);
const latest = tags[0];
if (!latest) {
  console.log("update: no v* release tags found on origin — nothing to update to.");
  process.exit(0);
}

const head = run(["git", "rev-parse", "HEAD"]);
const target = run(["git", "rev-parse", `${latest}^{commit}`]);
const currentVersion: string = (await Bun.file(resolve(ROOT, "package.json")).json()).version;

if (head === target) {
  console.log(`\nWove is up to date — you're on ${latest} (v${currentVersion}).`);
  process.exit(0);
}

console.log(`\nUpdate available: v${currentVersion} → ${latest}`);

// Changelog delta: everything in the target tag's CHANGELOG above the section
// for the version we're currently running.
const changelog = run(["git", "show", `${latest}:CHANGELOG.md`], { allowFail: true });
if (changelog) {
  const stop = changelog.indexOf(`## v${currentVersion}`);
  const delta = (stop === -1 ? changelog : changelog.slice(0, stop)).trim();
  const start = delta.indexOf("\n## ");
  if (start !== -1) console.log(`\n${delta.slice(start + 1).trim()}\n`);
}

if (checkOnly) {
  console.log(`Run \`bun run update\` to install ${latest}.`);
  process.exit(0);
}

console.log(`checking out ${latest}…`);
runInherit(["git", "checkout", latest]);
console.log("\n$ bun install");
runInherit(["bun", "install"]);
console.log("\n$ bun run build");
runInherit(["bun", "run", "build"]);

console.log(`\nUpdated to ${latest}.`);
console.log("The database was not touched: pending Drizzle migrations run on the next boot,");
console.log("and Wove backs the SQLite file up to data/backups/ before applying them.");
console.log("\nrestart wove to finish (systemd: sudo systemctl restart wove; dev: rerun bun run start)");
