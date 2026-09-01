import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

/** All timestamps are ISO-8601 strings (`new Date().toISOString()`) so they map 1:1 to the SDK's `ISODate`. */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "editor", "author", "contributor"] }).notNull().default("editor"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => ({ byUser: index("sessions_user_idx").on(t.userId) }),
);

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    /** JSON array of Scope */
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
  },
  (t) => ({ byHash: index("agents_key_hash_idx").on(t.keyHash) }),
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["post", "page"] }).notNull().default("post"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    /** "markdown" (content is Markdown) or "blocks" (content is a JSON BlocksDoc). */
    format: text("format", { enum: ["markdown", "blocks"] }).notNull().default("markdown"),
    excerpt: text("excerpt"),
    status: text("status", { enum: ["draft", "pending", "published", "scheduled", "trashed"] }).notNull().default("draft"),
    /** ImageRef JSON or null. */
    featuredImage: text("featured_image", { mode: "json" }).$type<Record<string, unknown> | null>(),
    /** { title, description, ogImage, noindex } JSON. */
    seo: text("seo", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    /** Set when trashed, so trash can be auto-purged later. */
    trashedAt: text("trashed_at"),
    /** Page hierarchy (wave 2): parent page id. */
    parentId: text("parent_id"),
    authorId: text("author_id"),
    publishedAt: text("published_at"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex("posts_slug_unique").on(t.slug),
    byStatus: index("posts_status_idx").on(t.status),
    byType: index("posts_type_idx").on(t.type),
  }),
);

export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    ts: text("ts").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    /** full snapshot of the previous row */
    snapshot: text("snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    actorId: text("actor_id"),
  },
  (t) => ({ byPost: index("revisions_post_idx").on(t.postId, t.ts) }),
);

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    taxonomy: text("taxonomy").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ uniq: uniqueIndex("terms_taxonomy_slug_unique").on(t.taxonomy, t.slug) }),
);

export const postTerms = sqliteTable(
  "post_terms",
  {
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    termId: text("term_id").notNull().references(() => terms.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.termId] }),
    byTerm: index("post_terms_term_idx").on(t.termId),
  }),
);

export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  url: text("url").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  alt: text("alt"),
  width: integer("width"),
  height: integer("height"),
  /** Resized renditions: [{ width, url, format }] (images only). */
  variants: text("variants", { mode: "json" }).$type<Array<{ width: number; url: string; format?: string }>>().notNull().default([]),
  createdAt: text("created_at").notNull(),
});

export const menus = sqliteTable("menus", {
  location: text("location").primaryKey(),
  name: text("name").notNull(),
  /** MenuItem[] JSON (one level of nesting). */
  items: text("items", { mode: "json" }).$type<unknown[]>().notNull().default([]),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    actorKind: text("actor_kind", { enum: ["user", "agent", "anon", "system"] }).notNull(),
    actorId: text("actor_id"),
    channel: text("channel", { enum: ["ui", "rest", "mcp", "system", "chat"] }).notNull(),
    tool: text("tool").notNull(),
    input: text("input", { mode: "json" }).$type<unknown>(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
  },
  (t) => ({ byTs: index("audit_ts_idx").on(t.ts), byTool: index("audit_tool_idx").on(t.tool) }),
);

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    actorKind: text("actor_kind", { enum: ["user", "agent", "anon", "system"] }).notNull(),
    actorId: text("actor_id"),
    channel: text("channel", { enum: ["ui", "rest", "mcp", "system", "chat"] }).notNull(),
    tool: text("tool").notNull(),
    provider: text("provider", { enum: ["anthropic", "openai", "google", "xai", "openai-compatible"] }).notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    keySource: text("key_source", { enum: ["byok", "platform", "none"] }).notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    ok: integer("ok", { mode: "boolean" }).notNull(),
  },
  (t) => ({ byTs: index("ai_usage_ts_idx").on(t.ts), byTool: index("ai_usage_tool_idx").on(t.tool) }),
);

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  actorKind: text("actor_kind", { enum: ["user", "agent", "anon", "system"] }).notNull(),
  actorId: text("actor_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** ChatToolCall[] JSON — reads already executed, mutations awaiting approval. */
    toolCalls: text("tool_calls", { mode: "json" }).$type<unknown[]>().notNull().default([]),
    planPending: integer("plan_pending", { mode: "boolean" }).notNull().default(false),
    /** { inputTokens, outputTokens } JSON, assistant messages only. */
    usage: text("usage", { mode: "json" }).$type<unknown>(),
    ts: text("ts").notNull(),
  },
  (t) => ({ byThread: index("chat_messages_thread_idx").on(t.threadId) }),
);

export type ChatThreadRow = typeof chatThreads.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;

export type PostRow = typeof posts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type TermRow = typeof terms.$inferSelect;
export type AiUsageRow = typeof aiUsage.$inferSelect;

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "editor", "author", "contributor"] }).notNull().default("editor"),
  invitedBy: text("invited_by"),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at").notNull(),
});

export const passwordResets = sqliteTable("password_resets", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const redirects = sqliteTable("redirects", {
  id: text("id").primaryKey(),
  fromPath: text("from_path").notNull().unique(),
  toPath: text("to_path").notNull(),
  code: integer("code").notNull().default(301),
  source: text("source", { enum: ["manual", "slug-change", "import"] }).notNull().default("manual"),
  hits: integer("hits").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const notFoundLog = sqliteTable("not_found_log", {
  path: text("path").primaryKey(),
  count: integer("count").notNull().default(0),
  lastSeen: text("last_seen").notNull(),
  referrer: text("referrer"),
});
