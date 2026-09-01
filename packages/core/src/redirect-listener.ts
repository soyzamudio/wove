/**
 * Slug-change auto-redirects.
 *
 * When a published post's slug changes, every existing link to the old address breaks.
 * This listener turns that into a 301.
 *
 * WHY REVISIONS: `post.afterSave` only carries the *new* post, and the emit site lives in
 * `tools/content.ts`, which this feature does not own. `post.update` snapshots the previous
 * row into `revisions` immediately before writing, so the newest revision for the post is
 * exactly the pre-save state — that is where the old slug is read from. If the payload ever
 * grows a `previous` field, swap the `previousSlug` helper for it and delete the rest.
 */
import { desc, eq, ne, and } from "drizzle-orm";
import type { DB } from "./db";
import type { Hooks } from "./hooks";
import { redirects, revisions } from "./db/schema";
import { newId, nowIso } from "./ids";

/** The slug the newest revision snapshot holds, or null when there is no usable snapshot. */
export function previousSlug(db: DB, postId: string): string | null {
  const rev = db
    .select({ snapshot: revisions.snapshot })
    .from(revisions)
    .where(eq(revisions.postId, postId))
    .orderBy(desc(revisions.ts), desc(revisions.id))
    .limit(1)
    .get();
  const slug = (rev?.snapshot as { slug?: unknown } | undefined)?.slug;
  return typeof slug === "string" && slug.length > 0 ? slug : null;
}

/**
 * Point `/oldSlug` at `/newSlug` and collapse any chain that ended at the old address, so
 * a post renamed three times still resolves in one hop.
 */
export function recordSlugChange(db: DB, oldSlug: string, newSlug: string): void {
  if (oldSlug === newSlug) return;
  const fromPath = `/${oldSlug}`;
  const toPath = `/${newSlug}`;
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

/**
 * Subscribe to `post.afterSave`. Returns the unsubscribe function `Hooks.on` hands back.
 */
export function registerRedirectListener(hooks: Hooks, db: DB): () => void {
  return hooks.on("post.afterSave", ({ post, created }) => {
    if (created || post.status !== "published") return;
    const before = previousSlug(db, post.id);
    if (!before || before === post.slug) return;
    try {
      recordSlugChange(db, before, post.slug);
    } catch (e) {
      // A save must never fail because a redirect could not be written.
      console.warn("[redirects] slug-change redirect failed:", (e as Error).message);
    }
  });
}
