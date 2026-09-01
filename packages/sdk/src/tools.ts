/**
 * The canonical tool catalog. `packages/core` implements exactly these names;
 * admin/site/agents call them. Adding a tool = add it here + implement in core.
 */
import { z } from "zod";
import * as S from "./schemas";

export const ToolCatalog = {
  // content
  "post.list":    { input: S.PostListInput, output: S.Page(S.Post), scopes: ["content:read"] },
  "post.get":     { input: z.object({ id: S.Id.optional(), slug: S.Slug.optional() }), output: S.Post, scopes: ["content:read"] },
  "post.create":  { input: S.PostCreateInput, output: S.Post, scopes: ["content:write"] },
  "post.update":  { input: S.PostUpdateInput, output: S.Post, scopes: ["content:write"] },
  "post.delete":  { input: z.object({ id: S.Id }), output: z.object({ ok: z.literal(true) }), scopes: ["content:write"] },
  "post.publish": { input: z.object({ id: S.Id, at: S.ISODate.optional() }), output: S.Post, scopes: ["content:publish"] },
  "post.revisions": { input: z.object({ id: S.Id }), output: z.array(z.object({ id: S.Id, ts: S.ISODate, title: z.string(), content: z.string() })), scopes: ["content:read"] },
  // taxonomy
  "term.list":    { input: z.object({ taxonomy: z.string().optional() }), output: z.array(S.Term), scopes: ["content:read"] },
  // media
  "media.list":   { input: z.object({ limit: z.number().int().default(50), cursor: z.string().optional() }), output: S.Page(S.Media), scopes: ["media:read"] },
  "media.upload": { input: z.object({ filename: z.string(), mime: z.string(), base64: z.string(), alt: z.string().optional() }), output: S.Media, scopes: ["media:write"] },
  "media.delete": { input: z.object({ id: S.Id }), output: z.object({ ok: z.literal(true) }), scopes: ["media:write"] },
  // settings
  "settings.get": { input: z.object({}), output: S.Settings, scopes: ["settings:read"] },
  "settings.update": { input: S.Settings.partial(), output: S.Settings, scopes: ["settings:write"] },
  // agents
  "agent.list":   { input: z.object({}), output: z.array(S.Agent), scopes: ["agents:manage"] },
  "agent.create": { input: z.object({ name: z.string().min(1), scopes: z.array(S.Scope).min(1) }), output: S.Agent.extend({ apiKey: z.string().describe("shown once") }), scopes: ["agents:manage"] },
  "agent.revoke": { input: z.object({ id: S.Id }), output: z.object({ ok: z.literal(true) }), scopes: ["agents:manage"] },
  // audit
  "audit.list":   { input: z.object({ limit: z.number().int().max(200).default(50), cursor: z.string().optional(), tool: z.string().optional() }), output: S.Page(S.AuditEntry), scopes: ["audit:read"] },
  // site
  "site.info":    { input: z.object({}), output: z.object({ settings: S.Settings, counts: z.object({ posts: z.number(), pages: z.number(), media: z.number() }), version: z.string() }), scopes: ["settings:read"] },
} as const satisfies Record<string, { input: z.ZodTypeAny; output: z.ZodTypeAny; scopes: readonly S.Scope[] }>;

export type ToolName = keyof typeof ToolCatalog;
export type ToolInput<N extends ToolName> = z.input<(typeof ToolCatalog)[N]["input"]>;
export type ToolOutput<N extends ToolName> = z.output<(typeof ToolCatalog)[N]["output"]>;

/** Human-readable descriptions used for MCP + OpenAPI. Keep in sync with ToolCatalog keys. */
export const ToolDescriptions: Record<ToolName, string> = {
  "post.list": "List posts or pages with optional filters. Paginated via cursor.",
  "post.get": "Fetch one post/page by id or slug.",
  "post.create": "Create a post or page. Content is Markdown. Defaults to draft.",
  "post.update": "Update fields of an existing post/page. Creates a revision.",
  "post.delete": "Permanently delete a post/page.",
  "post.publish": "Publish now, or schedule when `at` is a future ISO date.",
  "post.revisions": "List prior revisions of a post/page.",
  "term.list": "List taxonomy terms (tags/categories) with usage counts.",
  "media.list": "List media library items.",
  "media.upload": "Upload a file (base64). Returns the media item with a public URL.",
  "media.delete": "Delete a media item and its file.",
  "settings.get": "Read site settings.",
  "settings.update": "Update site settings (partial).",
  "agent.list": "List agents (API-key principals).",
  "agent.create": "Create an agent with scopes. The API key is returned exactly once.",
  "agent.revoke": "Revoke an agent's key permanently.",
  "audit.list": "Read the audit log of every tool call (who, via which channel, what).",
  "site.info": "Site overview: settings, content counts, version.",
};
