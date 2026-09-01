import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

/** All timestamps are ISO-8601 strings (`new Date().toISOString()`) so they map 1:1 to the SDK's `ISODate`. */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "editor"] }).notNull().default("editor"),
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
    excerpt: text("excerpt"),
    status: text("status", { enum: ["draft", "published", "scheduled"] }).notNull().default("draft"),
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
  createdAt: text("created_at").notNull(),
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
    actorKind: text("actor_kind", { enum: ["user", "agent", "anon"] }).notNull(),
    actorId: text("actor_id"),
    channel: text("channel", { enum: ["ui", "rest", "mcp", "system"] }).notNull(),
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
    actorKind: text("actor_kind", { enum: ["user", "agent", "anon"] }).notNull(),
    actorId: text("actor_id"),
    channel: text("channel", { enum: ["ui", "rest", "mcp", "system"] }).notNull(),
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

export type PostRow = typeof posts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type TermRow = typeof terms.$inferSelect;
export type AiUsageRow = typeof aiUsage.$inferSelect;
