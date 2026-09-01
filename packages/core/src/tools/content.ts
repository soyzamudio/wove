import { and, desc, eq, like, or, inArray } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions } from "@agentpress/sdk";
import { posts, postTerms, revisions, terms as termsTable } from "../db/schema";
import { newId, nowIso } from "../ids";
import { defineTool, badRequest, notFound, type Ctx } from "./registry";
import {
  decodeCursor, encodeCursor, hydratePost, hydratePosts, setPostTerms, uniqueSlug,
} from "./shared";

const D = ToolDescriptions;

function getPostRow(ctx: Ctx, id: string) {
  const row = ctx.db.select().from(posts).where(eq(posts.id, id)).get();
  if (!row) throw notFound(`No post with id "${id}"`);
  return row;
}

export const postList = defineTool({
  name: "post.list",
  description: D["post.list"],
  input: ToolCatalog["post.list"].input,
  output: ToolCatalog["post.list"].output,
  scopes: ToolCatalog["post.list"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const where = [] as any[];
    if (input.type) where.push(eq(posts.type, input.type));
    if (input.status) where.push(eq(posts.status, input.status));
    if (input.q) {
      const q = `%${input.q}%`;
      where.push(or(like(posts.title, q), like(posts.content, q))!);
    }
    if (input.term) {
      const ids = ctx.db
        .select({ postId: postTerms.postId })
        .from(postTerms)
        .innerJoin(termsTable, eq(postTerms.termId, termsTable.id))
        .where(eq(termsTable.slug, input.term))
        .all()
        .map((r) => r.postId);
      if (ids.length === 0) return { items: [], nextCursor: null };
      where.push(inArray(posts.id, ids));
    }
    const offset = decodeCursor(input.cursor);
    const rows = ctx.db
      .select()
      .from(posts)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(input.limit + 1)
      .offset(offset)
      .all();
    const items = hydratePosts(ctx.db, rows.slice(0, input.limit));
    return { items, nextCursor: rows.length > input.limit ? encodeCursor(offset + input.limit) : null };
  },
});

export const postGet = defineTool({
  name: "post.get",
  description: D["post.get"],
  input: ToolCatalog["post.get"].input,
  output: ToolCatalog["post.get"].output,
  scopes: ToolCatalog["post.get"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    if (!input.id && !input.slug) throw badRequest("Provide either `id` or `slug`");
    const row = input.id
      ? ctx.db.select().from(posts).where(eq(posts.id, input.id)).get()
      : ctx.db.select().from(posts).where(eq(posts.slug, input.slug!)).get();
    if (!row) throw notFound("Post not found", { id: input.id, slug: input.slug });
    return hydratePost(ctx.db, row);
  },
});

export const postCreate = defineTool({
  name: "post.create",
  description: D["post.create"],
  input: ToolCatalog["post.create"].input,
  output: ToolCatalog["post.create"].output,
  scopes: ToolCatalog["post.create"].scopes,
  handler: async (ctx, input) => {
    const ts = nowIso();
    const id = newId();
    const draft: Record<string, unknown> = {
      id,
      type: input.type,
      slug: uniqueSlug(ctx.db, input.slug ?? input.title),
      title: input.title,
      content: input.content,
      excerpt: input.excerpt ?? null,
      status: input.status,
      authorId: ctx.actor.kind === "user" ? ctx.actor.id : null,
      publishedAt: input.publishedAt ?? (input.status === "published" ? ts : null),
      meta: input.meta ?? {},
      createdAt: ts,
      updatedAt: ts,
    };
    await ctx.hooks.emit("post.beforeSave", {
      draft, existing: null, ctx: { actor: ctx.actor, channel: ctx.channel },
    });
    ctx.db.insert(posts).values(draft as any).run();
    if (input.terms?.length) setPostTerms(ctx.db, id, input.terms);

    const post = hydratePost(ctx.db, getPostRow(ctx, id));
    const hookCtx = { actor: ctx.actor, channel: ctx.channel };
    await ctx.hooks.emit("post.afterSave", { post, created: true, ctx: hookCtx });
    if (post.status !== "draft") await ctx.hooks.emit("post.publish", { post, ctx: hookCtx });
    return post;
  },
});

export const postUpdate = defineTool({
  name: "post.update",
  description: D["post.update"],
  input: ToolCatalog["post.update"].input,
  output: ToolCatalog["post.update"].output,
  scopes: ToolCatalog["post.update"].scopes,
  handler: async (ctx, input) => {
    const prev = getPostRow(ctx, input.id);
    const prevPost = hydratePost(ctx.db, prev);
    const ts = nowIso();

    // snapshot the *previous* state before touching the row
    ctx.db.insert(revisions).values({
      id: newId(),
      postId: prev.id,
      ts,
      title: prev.title,
      content: prev.content,
      snapshot: prevPost as unknown as Record<string, unknown>,
      actorId: ctx.actor.id,
    }).run();

    const draft: Record<string, unknown> = { updatedAt: ts };
    if (input.type !== undefined) draft.type = input.type;
    if (input.title !== undefined) draft.title = input.title;
    if (input.content !== undefined) draft.content = input.content;
    if (input.excerpt !== undefined) draft.excerpt = input.excerpt;
    if (input.meta !== undefined) draft.meta = input.meta;
    if (input.slug !== undefined) draft.slug = uniqueSlug(ctx.db, input.slug, prev.id);
    if (input.status !== undefined) {
      draft.status = input.status;
      if (input.status === "published" && !prev.publishedAt && input.publishedAt === undefined) {
        draft.publishedAt = ts;
      }
      if (input.status === "draft") draft.publishedAt = null;
    }
    if (input.publishedAt !== undefined) draft.publishedAt = input.publishedAt;

    await ctx.hooks.emit("post.beforeSave", {
      draft, existing: prevPost, ctx: { actor: ctx.actor, channel: ctx.channel },
    });
    ctx.db.update(posts).set(draft as any).where(eq(posts.id, prev.id)).run();
    if (input.terms !== undefined) setPostTerms(ctx.db, prev.id, input.terms);

    const post = hydratePost(ctx.db, getPostRow(ctx, prev.id));
    const hookCtx = { actor: ctx.actor, channel: ctx.channel };
    await ctx.hooks.emit("post.afterSave", { post, created: false, ctx: hookCtx });
    if (post.status !== "draft" && prevPost.status !== post.status) {
      await ctx.hooks.emit("post.publish", { post, ctx: hookCtx });
    }
    return post;
  },
});

export const postDelete = defineTool({
  name: "post.delete",
  description: D["post.delete"],
  input: ToolCatalog["post.delete"].input,
  output: ToolCatalog["post.delete"].output,
  scopes: ToolCatalog["post.delete"].scopes,
  handler: (ctx, input) => {
    getPostRow(ctx, input.id);
    ctx.db.delete(posts).where(eq(posts.id, input.id)).run();
    return { ok: true as const };
  },
});

export const postPublish = defineTool({
  name: "post.publish",
  description: D["post.publish"],
  input: ToolCatalog["post.publish"].input,
  output: ToolCatalog["post.publish"].output,
  scopes: ToolCatalog["post.publish"].scopes,
  handler: async (ctx, input) => {
    const prev = getPostRow(ctx, input.id);
    const now = new Date();
    const at = input.at ? new Date(input.at) : now;
    const scheduled = at.getTime() > now.getTime();
    ctx.db.update(posts).set({
      status: scheduled ? "scheduled" : "published",
      publishedAt: at.toISOString(),
      updatedAt: nowIso(),
    }).where(eq(posts.id, prev.id)).run();
    const post = hydratePost(ctx.db, getPostRow(ctx, prev.id));
    await ctx.hooks.emit("post.publish", { post, ctx: { actor: ctx.actor, channel: ctx.channel } });
    return post;
  },
});

export const postRevisions = defineTool({
  name: "post.revisions",
  description: D["post.revisions"],
  input: ToolCatalog["post.revisions"].input,
  output: ToolCatalog["post.revisions"].output,
  scopes: ToolCatalog["post.revisions"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    getPostRow(ctx, input.id);
    return ctx.db
      .select({ id: revisions.id, ts: revisions.ts, title: revisions.title, content: revisions.content })
      .from(revisions)
      .where(eq(revisions.postId, input.id))
      .orderBy(desc(revisions.ts), desc(revisions.id))
      .all();
  },
});

export const contentTools = [
  postList, postGet, postCreate, postUpdate, postDelete, postPublish, postRevisions,
];
