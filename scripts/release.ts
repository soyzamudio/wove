#!/usr/bin/env bun
/**
 * Release cutter: decides the next version, bumps every package.json, writes a
 * CHANGELOG section, syncs the lockfile, commits, and tags. It never pushes —
 * it prints the push command for a human to run.
 *
 * Usage:
 *   bun run release              # bump derived from commits since the last v* tag
 *   bun run release patch        # force a patch bump
 *   bun run release minor        # force a minor bump
 *   bun run release --dry-run    # print everything, change nothing
 *
 * How the bump is decided (pre-1.0 policy — see CHANGELOG.md):
 *   - an explicit patch/minor argument wins (but a forced `patch` FAILS if a
 *     tripwire below fires — those changes are never patch-safe)
 *   - otherwise, conventional commits since the last tag: `fix:` → patch,
 *     `feat:` → minor, `!`/`BREAKING CHANGE` → minor (while < 1.0)
 *   - commits that aren't conventional count as patch-level and are listed
 *     under "Changes"
 *   - no tag yet → this is the first release: the current package.json version
 *     is published as-is
 *
 * Tripwires (force at least minor, and fail a forced `patch`):
 *   - new migration files under packages/core/drizzle/ since the last tag
 *   - any diff under packages/sdk/src/ since the last tag
 *
 * Staging safety: the script stages only the files it manages (package.json
 * files, bun.lock, CHANGELOG.md). If anything else is already staged it aborts,
 * so it's safe to run in a tree with unrelated unstaged work in progress.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const CHANGELOG = resolve(ROOT, "CHANGELOG.md");

type Bump = "patch" | "minor";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function run(args: string[], opts: { allowFail?: boolean } = {}): string {
  const p = Bun.spawnSync(args, { cwd: ROOT, stderr: "pipe", stdout: "pipe" });
  if (p.exitCode !== 0 && !opts.allowFail) {
    fail(`command failed: ${args.join(" ")}\n${p.stderr.toString().trim()}`);
  }
  return p.stdout.toString().trim();
}

function runInherit(args: string[]): void {
  const p = Bun.spawnSync(args, { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
  if (p.exitCode !== 0) fail(`command failed: ${args.join(" ")}`);
}

function fail(msg: string): never {
  console.error(`\nrelease: ${msg}`);
  process.exit(1);
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const forced = argv.find((a) => a === "patch" || a === "minor") as Bump | undefined;
const unknown = argv.filter((a) => a !== "--dry-run" && a !== "patch" && a !== "minor");
if (unknown.length) fail(`unknown argument(s): ${unknown.join(", ")}\nusage: bun run release [patch|minor] [--dry-run]`);

// ---------------------------------------------------------------------------
// workspace package.json files
// ---------------------------------------------------------------------------

const rootPkgPath = resolve(ROOT, "package.json");
const rootPkg = await Bun.file(rootPkgPath).json();
const currentVersion: string = rootPkg.version;

const pkgPaths = [
  "package.json",
  ...run(["git", "ls-files", "packages/*/package.json"]).split("\n").filter(Boolean),
];

// ---------------------------------------------------------------------------
// git state
// ---------------------------------------------------------------------------

const staged = run(["git", "diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
const managed = new Set([...pkgPaths, "bun.lock", "CHANGELOG.md"]);
const strayStaged = staged.filter((f) => !managed.has(f));
if (strayStaged.length && !dryRun) {
  fail(
    `refusing to release with unrelated staged changes (unstage them first):\n  ${strayStaged.join("\n  ")}\n` +
      `Unstaged work in progress is fine — this script only stages the files it manages.`,
  );
}

const tags = run(["git", "tag", "--list", "v*", "--sort=-v:refname"]).split("\n").filter(Boolean);
const lastTag = tags[0];

const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const subjects = run(["git", "log", "--no-merges", "--pretty=format:%s", range])
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const bodies = run(["git", "log", "--no-merges", "--pretty=format:%B%x00", range]).split("\0");

// ---------------------------------------------------------------------------
// classify commits
// ---------------------------------------------------------------------------

const CONVENTIONAL = /^(?<type>[a-z]+)(?<scope>\([^)]*\))?(?<bang>!)?:\s*(?<desc>.+)$/;

const breaking: string[] = [];
const features: string[] = [];
const fixes: string[] = [];
const changes: string[] = [];

for (const subject of subjects) {
  const m = CONVENTIONAL.exec(subject);
  if (!m?.groups) {
    changes.push(subject);
    continue;
  }
  const { type, bang, desc } = m.groups as Record<string, string | undefined>;
  const line = `${m.groups.scope ? `${m.groups.scope.slice(1, -1)}: ` : ""}${desc}`;
  if (bang) breaking.push(line);
  else if (type === "feat") features.push(line);
  else if (type === "fix") fixes.push(line);
  else changes.push(subject);
}
if (bodies.some((b) => b.includes("BREAKING CHANGE"))) {
  for (const b of bodies) {
    if (!b.includes("BREAKING CHANGE")) continue;
    const line = b.split("\n").find((l) => l.includes("BREAKING CHANGE"))!.trim();
    if (!breaking.includes(line)) breaking.push(line);
  }
}

let commitBump: Bump = "patch";
if (breaking.length || features.length) commitBump = "minor";

// ---------------------------------------------------------------------------
// tripwires
// ---------------------------------------------------------------------------

const tripwires: string[] = [];
if (lastTag) {
  const drizzle = run(["git", "diff", "--name-status", "--diff-filter=A", `${lastTag}..HEAD`, "--", "packages/core/drizzle"])
    .split("\n")
    .filter(Boolean);
  if (drizzle.length) {
    tripwires.push(
      `new DB migration file(s) under packages/core/drizzle/ (${drizzle.length}) — migrations are always >= minor`,
    );
  }
  const sdk = run(["git", "diff", "--name-only", `${lastTag}..HEAD`, "--", "packages/sdk/src"]).split("\n").filter(Boolean);
  if (sdk.length) {
    tripwires.push(`packages/sdk/src/ changed (${sdk.length} file(s)) — the SDK is the public contract, so >= minor`);
  }
}

// ---------------------------------------------------------------------------
// resolve the version
// ---------------------------------------------------------------------------

const [maj, min, pat] = currentVersion.split(".").map(Number);
let version: string;
let reason: string;

if (!lastTag) {
  version = currentVersion;
  reason = `no v* tag exists yet — publishing the current package.json version as the first release`;
} else {
  let bump: Bump = forced ?? commitBump;
  if (tripwires.length) {
    if (forced === "patch") {
      fail(
        `a patch release was requested, but these changes are not patch-safe:\n  - ${tripwires.join("\n  - ")}\n` +
          `Run \`bun run release minor\` (or drop the argument) instead.`,
      );
    }
    if (bump === "patch") bump = "minor";
  }
  version = bump === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  reason = forced
    ? `forced \`${forced}\` argument`
    : `derived from ${subjects.length} commit(s) since ${lastTag} (${commitBump})`;
  if (tripwires.length) reason += `, raised to minor by tripwire`;
}

// ---------------------------------------------------------------------------
// changelog section
// ---------------------------------------------------------------------------

function section(title: string, lines: string[]): string {
  if (!lines.length) return "";
  return `### ${title}\n${lines.map((l) => `- ${l}`).join("\n")}\n\n`;
}

const grouped =
  section("Breaking", breaking) + section("Features", features) + section("Fixes", fixes) + section("Changes", changes);
const entry = `## v${version} — ${today()}\n\n${grouped || "_No changes recorded._\n\n"}`;

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

console.log(`\nwove release${dryRun ? " (dry run — nothing will be written)" : ""}`);
console.log(`  current version : ${currentVersion}`);
console.log(`  last tag        : ${lastTag ?? "(none)"}`);
console.log(`  commits         : ${subjects.length}`);
console.log(`  next version    : ${version}`);
console.log(`  why             : ${reason}`);
if (tripwires.length) for (const t of tripwires) console.log(`  tripwire        : ${t}`);
console.log(`\n  packages to bump:`);
for (const p of pkgPaths) console.log(`    ${p}`);
const changelogText = (await Bun.file(CHANGELOG).exists()) ? await Bun.file(CHANGELOG).text() : "";
const sectionExists = changelogText.includes(`## v${version} `) || changelogText.includes(`## v${version}\n`);
console.log(`\n--- CHANGELOG.md section ---\n${entry}----------------------------`);
console.log(
  sectionExists
    ? `(CHANGELOG.md already has a v${version} section — it will be kept as written, not replaced.)\n`
    : "",
);

if (dryRun) {
  console.log("Would then: bun install, commit `release: v" + version + "`, tag v" + version + ".");
  console.log(`Push (you, afterwards): git push origin main --follow-tags`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

for (const p of pkgPaths) {
  const abs = resolve(ROOT, p);
  const text = await Bun.file(abs).text();
  if (!/"version"\s*:\s*"[^"]*"/.test(text)) fail(`${p} has no "version" field`);
  await Bun.write(abs, text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`));
}
console.log(`bumped ${pkgPaths.length} package.json file(s) to ${version}`);

const existing = (await Bun.file(CHANGELOG).exists()) ? await Bun.file(CHANGELOG).text() : "# Changelog\n\n";
if (existing.includes(`## v${version} `) || existing.includes(`## v${version}\n`)) {
  // Someone (or the v0.1.0 seed) already wrote this version's section by hand.
  console.log(`CHANGELOG.md already has a v${version} section — leaving it as written`);
} else {
  const firstSection = existing.indexOf("\n## ");
  const updated =
    firstSection === -1
      ? `${existing.trimEnd()}\n\n${entry}`
      : `${existing.slice(0, firstSection + 1)}${entry}${existing.slice(firstSection + 1)}`;
  await Bun.write(CHANGELOG, updated);
  console.log("prepended the CHANGELOG.md section");
}

console.log("\n$ bun install  (lockfile version sync)");
runInherit(["bun", "install"]);

const toStage: string[] = [...pkgPaths, "CHANGELOG.md"];
if (await Bun.file(resolve(ROOT, "bun.lock")).exists()) toStage.push("bun.lock");
run(["git", "add", "--", ...toStage]);
run(["git", "commit", "-m", `release: v${version}`]);
run(["git", "tag", "-a", `v${version}`, "-m", `wove v${version}`]);

console.log(`\ncommitted release: v${version} and tagged v${version}`);
console.log(run(["git", "--no-pager", "show", "--stat", "--oneline", "HEAD"]));
console.log(`\nNothing was pushed. When you're ready:\n\n  git push origin main --follow-tags\n`);
console.log(`That tag push triggers .github/workflows/release.yml (tests, GHCR image, GitHub release).`);
