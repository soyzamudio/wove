import { z } from "zod";

// ---------- primitives ----------
export const Id = z.string().min(1);
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case slug");
export const ISODate = z.string().datetime();

// ---------- actors ----------
export const Scope = z.enum([
  "*",
  "content:read", "content:write", "content:publish",
  "media:read", "media:write",
  "settings:read", "settings:write",
  "agents:manage", "users:manage", "audit:read",
  "ai:use",
]);
export type Scope = z.infer<typeof Scope>;

export const Actor = z.object({
  kind: z.enum(["user", "agent", "anon"]),
  id: z.string().nullable(),
  scopes: z.array(Scope),
});
export type Actor = z.infer<typeof Actor>;

export const Channel = z.enum(["ui", "rest", "mcp", "system"]);
export type Channel = z.infer<typeof Channel>;

// ---------- content ----------
export const PostType = z.enum(["post", "page"]);
export const PostStatus = z.enum(["draft", "published", "scheduled"]);

export const Post = z.object({
  id: Id,
  type: PostType,
  slug: Slug,
  title: z.string(),
  content: z.string().describe("Markdown"),
  excerpt: z.string().nullable(),
  status: PostStatus,
  authorId: Id.nullable(),
  publishedAt: ISODate.nullable(),
  meta: z.record(z.unknown()).default({}),
  terms: z.array(z.object({ taxonomy: z.string(), slug: Slug, name: z.string() })).default([]),
  createdAt: ISODate,
  updatedAt: ISODate,
});
export type Post = z.infer<typeof Post>;

export const PostCreateInput = z.object({
  type: PostType.default("post"),
  slug: Slug.optional().describe("derived from title if omitted"),
  title: z.string().min(1),
  content: z.string().default(""),
  excerpt: z.string().optional(),
  status: PostStatus.default("draft"),
  publishedAt: ISODate.optional(),
  meta: z.record(z.unknown()).optional(),
  terms: z.array(z.object({ taxonomy: z.string(), name: z.string() })).optional(),
});
export type PostCreateInput = z.infer<typeof PostCreateInput>;

export const PostUpdateInput = PostCreateInput.partial().extend({ id: Id });
export type PostUpdateInput = z.infer<typeof PostUpdateInput>;

export const PostListInput = z.object({
  type: PostType.optional(),
  status: PostStatus.optional(),
  q: z.string().optional(),
  term: z.string().optional().describe("term slug"),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PostListInput = z.infer<typeof PostListInput>;

export const Page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const Term = z.object({ id: Id, taxonomy: z.string(), slug: Slug, name: z.string(), count: z.number().int() });
export type Term = z.infer<typeof Term>;

export const Media = z.object({
  id: Id, path: z.string(), url: z.string(), mime: z.string(), size: z.number().int(),
  alt: z.string().nullable(), width: z.number().int().nullable(), height: z.number().int().nullable(),
  createdAt: ISODate,
});
export type Media = z.infer<typeof Media>;

export const Settings = z.object({
  siteTitle: z.string().default("My agentpress site"),
  tagline: z.string().default(""),
  siteUrl: z.string().url().default("http://localhost:4321"),
  theme: z.string().default("default"),
  postsPerPage: z.number().int().min(1).max(100).default(10),
});
export type Settings = z.infer<typeof Settings>;

export const Agent = z.object({
  id: Id, name: z.string(), scopes: z.array(Scope), createdBy: Id,
  createdAt: ISODate, lastUsedAt: ISODate.nullable(),
});
export type Agent = z.infer<typeof Agent>;

export const AuditEntry = z.object({
  id: Id, ts: ISODate, actorKind: Actor.shape.kind, actorId: z.string().nullable(),
  channel: Channel, tool: z.string(), input: z.unknown(), ok: z.boolean(), error: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const User = z.object({ id: Id, email: z.string().email(), name: z.string(), role: z.enum(["admin", "editor"]), createdAt: ISODate });
export type User = z.infer<typeof User>;

// ---------- AI ----------
export const AiProvider = z.enum(["anthropic", "openai", "google", "xai", "openai-compatible"]);
export type AiProvider = z.infer<typeof AiProvider>;

export const AiKeySource = z.enum(["byok", "platform", "none"]);
export type AiKeySource = z.infer<typeof AiKeySource>;

/** What `ai.config` returns. Never includes the key itself. */
export const AiConfig = z.object({
  provider: AiProvider,
  model: z.string(),
  baseUrl: z.string().nullable().describe("openai-compatible only (e.g. http://localhost:11434/v1)"),
  systemPrompt: z.string().nullable().describe("appended to the built-in site context prompt"),
  keySource: AiKeySource,
  keyHint: z.string().nullable().describe("last 4 chars of the stored key, e.g. '…4f2a'"),
});
export type AiConfig = z.infer<typeof AiConfig>;

export const AiConfigureInput = z.object({
  provider: AiProvider.optional(),
  model: z.string().min(1).optional(),
  baseUrl: z.string().url().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  apiKey: z.string().min(1).optional().describe("store a new site key (BYOK)"),
  clearKey: z.boolean().optional().describe("remove the stored site key; falls back to platform key if any"),
});
export type AiConfigureInput = z.infer<typeof AiConfigureInput>;

export const AiUsage = z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() });
export type AiUsage = z.infer<typeof AiUsage>;

export const AiUsageEntry = z.object({
  id: Id, ts: ISODate,
  actorKind: Actor.shape.kind, actorId: z.string().nullable(), channel: Channel,
  tool: z.string(), provider: AiProvider, model: z.string(),
  inputTokens: z.number().int(), outputTokens: z.number().int(),
  keySource: AiKeySource, durationMs: z.number().int(), ok: z.boolean(),
});
export type AiUsageEntry = z.infer<typeof AiUsageEntry>;

export const AiTextResult = z.object({ text: z.string(), model: z.string(), usage: AiUsage });
export type AiTextResult = z.infer<typeof AiTextResult>;
