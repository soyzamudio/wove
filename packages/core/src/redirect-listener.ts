/**
 * Path-change auto-redirects.
 *
 * When a published post or page moves — its slug changes, or a page is re-parented —
 * every existing link to the old address breaks. This listener turns that into a 301.
 *
 * WHY REVISIONS: `post.afterSave` only carries the *new* post, and the emit site lives in
 * `tools/content.ts`, which this feature does not own. `post.update` snapshots the previous
 * row into `revisions` immediately before writing, so the newest revision for the post is
 * exactly the pre-save state — that is where the old path is read from. If the payload ever
 * grows a `previous` field, swap the `previousPath` helper for it and delete the rest.
 *
 * NOT COVERED: changing `settings.postPermalink` silently changes every post's path; v1
 * does not backfill redirects for that.
 */
import { desc, eq, ne, and, inArray } from "drizzle-orm";
import type { DB } from "./db";
import type { Hooks } from "./hooks";
import { posts, redirects, revisions } from "./db/schema";
import { newId, nowIso } from "./ids";
import { computePath, makePathCtx } from "./tools/shared";

/** The newest revision snapshot for a post, or null when there is no usable one. */
function newestSnapshot(db: DB, postId: string): { slug?: unknown; path?: unknown } | null {
  const rev = db
    .select({ snapshot: revisions.snapshot })
    .from(revisions)
    .where(eq(revisions.postId, postId))
    .orderBy(desc(revisions.ts), desc(revisions.id))
    .limit(1)
    .get();
  return (rev?.snapshot as { slug?: unknown; path?: unknown } | undefined) ?? null;
}

/** The slug the newest revision snapshot holds, or null when there is no usable snapshot. */
export function previousSlug(db: DB, postId: string): string | null {
  const slug = newestSnapshot(db, postId)?.slug;
  return typeof slug === "string" && slug.length > 0 ? slug : null;
}

/**
 * The public path the newest snapshot holds. Snapshots taken before `path` existed only
 * carry a slug, so fall back to `/slug` for those.
 */
export function previousPath(db: DB, postId: string): string | null {
  const snap = newestSnapshot(db, postId);
  if (!snap) return null;
  if (typeof snap.path === "string" && snap.path.startsWith("/")) return snap.path;
  return typeof snap.slug === "string" && snap.slug.length > 0 ? `/${snap.slug}` : null;
}

/**
 * Point `oldPath` at `newPath` and collapse any chain that ended at the old address, so
 * a page renamed three times still resolves in one hop.
 */
export function recordPathChange(db: DB, fromPath: string, toPath: string): void {
  if (fromPath === toPath) return;
  const ts = nowIso();

  db.insert(redirects)
    .values({ id: newId(), fromPath, toPath, code: 301, source: "slug-change", hits: 0, createdAt: ts })
    .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath, code: 301, source: "slug-change" } })
    .run();

  // chain collapse: /a → /old becomes /a → /new (skipping the row we just wrote).
  db.update(redirects).set({ toPath }).where(and(eq(redirects.toPath, fromPath), ne(redirects.fromPath, fromPath))).run();
  // …and drop anything that collapsing turned into a self-redirect (/new → /new).
  db.delete(redirects).where(and(eq(redirects.fromPath, toPath), eq(redirects.toPath, toPath))).run();
}

/** Kept for callers that still think in slugs; `/old` → `/new`. */
export function recordSlugChange(db: DB, oldSlug: string, newSlug: string): void {
  recordPathChange(db, `/${oldSlug}`, `/${newSlug}`);
}

/** Every descendant page of `rootId`, breadth-first. Bounded by the hierarchy depth cap. */
function descendantsOf(db: DB, rootId: string) {
  const out: { id: string; type: "post" | "page"; slug: string; parentId: string | null; status: string }[] = [];
  const seen = new Set<string>([rootId]);
  let level = [rootId];
  for (let i = 0; i < 3 && level.length > 0; i++) {
    const children = db
      .select({ id: posts.id, type: posts.type, slug: posts.slug, parentId: posts.parentId, status: posts.status })
      .from(posts)
      .where(inArray(posts.parentId, level))
      .all()
      .filter((r) => !seen.has(r.id));
    if (children.length === 0) break;
    for (const c of children) seen.add(c.id);
    out.push(...children);
    level = children.map((c) => c.id);
  }
  return out;
}

/**
 * Subscribe to `post.afterSave`. Returns the unsubscribe function `Hooks.on` hands back.
 */
export function registerRedirectListener(hooks: Hooks, db: DB): () => void {
  return hooks.on("post.afterSave", ({ post, created }) => {
    if (created || post.status !== "published") return;
    const before = previousPath(db, post.id);
    if (!before || before === post.path) return;
    try {
      recordPathChange(db, before, post.path);
      // Re-parenting or renaming a page moves everything underneath it too.
      if (post.type === "page") {
        const kids = descendantsOf(db, post.id);
        if (kids.length === 0) return;
        const ctx = makePathCtx(db, kids);
        for (const kid of kids) {
          if (kid.status !== "published") continue;
          const newPath = computePath(kid, ctx);
          if (!newPath.startsWith(`${post.path}/`)) continue;
          recordPathChange(db, before + newPath.slice(post.path.length), newPath);
        }
      }
    } catch (e) {
      // A save must never fail because a redirect could not be written.
      console.warn("[redirects] path-change redirect failed:", (e as Error).message);
    }
  });
}
