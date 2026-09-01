/**
 * The canonical tool catalog. `packages/core` implements exactly these names;
 * admin/site/agents call them. Adding a tool = add it here + implement in core.
 */
import { z } from "zod";
import * as Sc from "./schemas";
import * as B from "./blocks";
const S = { ...Sc, ...B };

export const ToolCatalog = {
  // content
  "post.list":    { input: S.PostListInput, output: S.Page(S.Post), scopes: ["content:read"] },
  "post.get":     { input: z.object({ id: S.Id.optional(), slug: S.Slug.optional() }), output: S.Post, scopes: ["content:read"] },
  "post.create":  { input: S.PostCreateInput, output: S.Post, scopes: ["content:write"] },
  "post.update":  { input: S.PostUpdateInput, output: S.Post, scopes: ["content:write"] },
  "post.delete":  { input: z.object({ id: S.Id, permanent: z.boolean().default(false) }), output: z.object({ ok: z.literal(true), trashed: z.boolean() }), scopes: ["content:write"] },
  "post.publish": { input: z.object({ id: S.Id, at: S.ISODate.optional() }), output: S.Post, scopes: ["content:publish"] },
  "post.restore":  { input: z.object({ id: S.Id }), output: S.Post, scopes: ["content:write"] },
  "post.bulk":     { input: z.object({ ids: z.array(S.Id).min(1).max(200), action: z.enum(["trash", "restore", "delete", "publish", "draft"]) }), output: z.object({ ok: z.literal(true), affected: z.number().int() }), scopes: ["content:write"] },
  "post.emptyTrash": { input: z.object({}), output: z.object({ ok: z.literal(true), deleted: z.number().int() }), scopes: ["content:write"] },
  "post.revisions": { input: z.object({ id: S.Id }), output: z.array(z.object({ id: S.Id, ts: S.ISODate, title: z.string(), content: z.string() })), scopes: ["content:read"] },
  // menus
  "menu.list":    { input: z.object({}), output: z.array(S.Menu), scopes: ["content:read"] },
  "menu.get":     { input: z.object({ location: S.MenuLocation }), output: S.Menu, scopes: ["content:read"] },
  "menu.set":     { input: z.object({ location: S.MenuLocation, name: z.string().optional(), items: z.array(S.MenuItem).max(50) }), output: S.Menu, scopes: ["settings:write"] },
  "menu.delete":  { input: z.object({ location: S.MenuLocation }), output: z.object({ ok: z.literal(true) }), scopes: ["settings:write"] },
  // design
  "design.get":    { input: z.object({}), output: S.Design, scopes: ["settings:read"] },
  "design.update": { input: S.Design.deepPartial(), output: S.Design, scopes: ["settings:write"] },
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
  // users
  "user.list":       { input: z.object({}), output: z.array(S.User), scopes: ["users:manage"] },
  "user.invite":     { input: z.object({ email: z.string().email(), role: S.UserRole.default("editor") }), output: z.object({ invite: S.Invite, acceptUrl: z.string().describe("share manually if email isn't configured"), emailSent: z.boolean() }), scopes: ["users:manage"] },
  "user.invites":    { input: z.object({}), output: z.array(S.Invite), scopes: ["users:manage"] },
  "user.revokeInvite": { input: z.object({ id: S.Id }), output: z.object({ ok: z.literal(true) }), scopes: ["users:manage"] },
  "user.updateRole": { input: z.object({ id: S.Id, role: S.UserRole }), output: S.User, scopes: ["users:manage"] },
  "user.remove":     { input: z.object({ id: S.Id }), output: z.object({ ok: z.literal(true) }), scopes: ["users:manage"] },
  "user.updateProfile": { input: z.object({ name: z.string().min(1).optional(), password: z.string().min(8).optional(), currentPassword: z.string().optional().describe("required when changing password") }), output: S.User, scopes: ["content:read"] },
  // email
  "email.status":    { input: z.object({}), output: S.EmailStatus, scopes: ["settings:read"] },
  "email.test":      { input: z.object({ to: z.string().email() }), output: z.object({ ok: z.literal(true) }), scopes: ["settings:write"] },
  // redirects & 404s
  "redirect.list":   { input: z.object({}), output: z.array(S.Redirect), scopes: ["settings:read"] },
  "redirect.create": { input: z.object({ fromPath: z.string(), toPath: z.string(), code: z.union([z.literal(301), z.literal(302)]).default(301) }), output: S.Redirect, scopes: ["settings:write"] },
  "redirect.delete": { input: z.object({ id: S.Id }), output: z.object({ ok: z.literal(true) }), scopes: ["settings:write"] },
  "notfound.list":   { input: z.object({ limit: z.number().int().max(200).default(50), cursor: z.string().optional() }), output: S.Page(S.NotFoundEntry), scopes: ["settings:read"] },
  "notfound.clear":  { input: z.object({ path: z.string().optional().describe("omit to clear all") }), output: z.object({ ok: z.literal(true), cleared: z.number().int() }), scopes: ["settings:write"] },
  // audit
  "audit.list":   { input: z.object({ limit: z.number().int().max(200).default(50), cursor: z.string().optional(), tool: z.string().optional() }), output: S.Page(S.AuditEntry), scopes: ["audit:read"] },
  // ai
  "ai.config":    { input: z.object({}), output: S.AiConfig, scopes: ["settings:read"] },
  "ai.configure": { input: S.AiConfigureInput, output: S.AiConfig, scopes: ["settings:write"] },
  "ai.models":    { input: z.object({ provider: S.AiProvider.optional() }), output: z.array(z.object({ id: z.string(), name: z.string().nullable() })), scopes: ["settings:read"] },
  "ai.test":      { input: z.object({}), output: z.object({ ok: z.literal(true), provider: S.AiProvider, model: z.string(), keySource: S.AiKeySource, latencyMs: z.number().int() }), scopes: ["settings:read", "ai:use"] },
  "ai.generate":  { input: z.object({ prompt: z.string().min(1), postId: S.Id.optional().describe("include this post as context"), maxTokens: z.number().int().min(64).max(64000).optional() }), output: S.AiTextResult, scopes: ["ai:use"] },
  "ai.rewrite":   { input: z.object({ text: z.string().min(1), instruction: z.string().min(1) }), output: S.AiTextResult, scopes: ["ai:use"] },
  "ai.draftPost": { input: z.object({ prompt: z.string().min(1), type: S.PostType.default("post"), terms: z.array(z.object({ taxonomy: z.string(), name: z.string() })).optional() }), output: S.Post, scopes: ["ai:use", "content:write"] },
  "ai.usage":     { input: z.object({ limit: z.number().int().max(200).default(50), cursor: z.string().optional(), since: S.ISODate.optional() }), output: S.Page(S.AiUsageEntry).extend({ totals: z.object({ calls: z.number().int(), inputTokens: z.number().int(), outputTokens: z.number().int() }) }), scopes: ["audit:read"] },
  // blocks (pages)
  "block.catalog":   { input: z.object({}), output: z.array(z.object({ type: S.BlockType, name: z.string(), description: z.string(), propsSchema: z.unknown() })), scopes: ["content:read"] },
  "block.validate":  { input: z.object({ doc: S.BlocksDoc }), output: z.object({ ok: z.literal(true), doc: S.BlocksDoc }), scopes: ["content:read"] },
  "ai.generatePage": { input: z.object({ prompt: z.string().min(1), title: z.string().optional(), save: z.boolean().default(false).describe("when true, creates a draft page and returns it in `post`") }), output: z.object({ title: z.string(), doc: S.BlocksDoc, post: S.Post.nullable(), usage: S.AiUsage }), scopes: ["ai:use"] },
  "ai.generateBlock": { input: z.object({ prompt: z.string().min(1), type: S.BlockType.optional().describe("force a block type; otherwise the model picks"), postId: S.Id.optional().describe("page for context") }), output: z.object({ block: S.Block, usage: S.AiUsage }), scopes: ["ai:use"] },
  "ai.editBlock":    { input: z.object({ block: S.Block, instruction: z.string().min(1), postId: S.Id.optional() }), output: z.object({ block: S.Block, usage: S.AiUsage }), scopes: ["ai:use"] },
  // site chat
  "chat.threads":  { input: z.object({}), output: z.array(S.ChatThread), scopes: ["ai:use"] },
  "chat.get":      { input: z.object({ id: S.Id }), output: z.object({ thread: S.ChatThread, messages: z.array(S.ChatMessage) }), scopes: ["ai:use"] },
  "chat.apply":    { input: z.object({ threadId: S.Id, messageId: S.Id, approve: z.array(z.string()).min(1).describe("tool-call ids to apply, in plan order") }), output: S.ChatMessage, scopes: ["ai:use"] },
  "chat.discard":  { input: z.object({ threadId: S.Id, messageId: S.Id }), output: S.ChatMessage, scopes: ["ai:use"] },
  "chat.delete":   { input: z.object({ id: S.Id }), output: z.object({ ok: z.literal(true) }), scopes: ["ai:use"] },
  // templates
  "template.list":    { input: z.object({}), output: z.array(S.TemplateSummary), scopes: ["content:read"] },
  "template.get":     { input: z.object({ slug: S.Slug }), output: S.SiteTemplate, scopes: ["content:read"] },
  "template.preview": { input: z.object({ slug: S.Slug.optional(), template: S.SiteTemplate.optional(), mode: z.enum(["replace", "merge"]).default("merge") }), output: S.TemplateApplyReport, scopes: ["content:read", "settings:read"] },
  "template.apply":   { input: z.object({ slug: S.Slug.optional(), template: S.SiteTemplate.optional(), mode: z.enum(["replace", "merge"]).default("merge"), includeSampleContent: z.boolean().default(false) }), output: S.TemplateApplyReport, scopes: ["content:write", "settings:write", "media:write"] },
  "template.export":  { input: z.object({ includeContent: z.boolean().default(false).describe("include all published posts as sample content") }), output: S.SiteTemplate, scopes: ["content:read", "settings:read", "media:read"] },
  // import / export
  "import.wordpress": { input: z.object({ xml: z.string().min(1).describe("WXR file contents (raw XML, or base64 when `encoding` is 'base64')"), encoding: z.enum(["utf8", "base64"]).default("utf8"), options: S.ImportOptions.default({}) }), output: S.ImportJob, scopes: ["content:write", "media:write", "settings:write"] },
  "import.status":    { input: z.object({ id: S.Id }), output: S.ImportJob, scopes: ["content:read"] },
  "import.list":      { input: z.object({}), output: z.array(S.ImportJob), scopes: ["content:read"] },
  "export.site":      { input: z.object({}), output: S.SiteExport, scopes: ["content:read", "settings:read", "media:read"] },
  // site
  "site.info":    { input: z.object({}), output: z.object({ settings: S.Settings, counts: z.object({ posts: z.number(), pages: z.number(), media: z.number() }), version: z.string() }), scopes: ["settings:read"] },
} as const satisfies Record<string, { input: z.ZodTypeAny; output: z.ZodTypeAny; scopes: readonly Sc.Scope[] }>;

export type ToolName = keyof typeof ToolCatalog;
export type ToolInput<N extends ToolName> = z.input<(typeof ToolCatalog)[N]["input"]>;
export type ToolOutput<N extends ToolName> = z.output<(typeof ToolCatalog)[N]["output"]>;

/** Human-readable descriptions used for MCP + OpenAPI. Keep in sync with ToolCatalog keys. */
export const ToolDescriptions: Record<ToolName, string> = {
  "post.list": "List posts or pages with optional filters. Paginated via cursor.",
  "post.get": "Fetch one post/page by id or slug.",
  "post.create": "Create a post or page. Content is Markdown. Defaults to draft.",
  "post.update": "Update fields of an existing post/page. Creates a revision.",
  "post.publish": "Publish now, or schedule when `at` is a future ISO date.",
  "post.delete": "Move a post/page to the trash (status 'trashed'). Pass permanent:true to delete for good.",
  "post.restore": "Restore a trashed post/page to draft.",
  "post.bulk": "Apply one action (trash/restore/delete/publish/draft) to many posts at once.",
  "post.emptyTrash": "Permanently delete everything in the trash.",
  "post.revisions": "List prior revisions of a post/page.",
  "menu.list": "List navigation menus (header, footer, custom).",
  "menu.get": "Get one navigation menu by location.",
  "menu.set": "Create or replace a navigation menu's items (one level of nesting).",
  "menu.delete": "Delete a navigation menu.",
  "design.get": "Read site design settings: logo, colors, fonts, radius, custom CSS.",
  "design.update": "Update site design settings (partial). The public site and page builder apply them as CSS variables.",
  "term.list": "List taxonomy terms (tags/categories) with usage counts.",
  "media.list": "List media library items.",
  "media.upload": "Upload a file (base64). Returns the media item with a public URL.",
  "media.delete": "Delete a media item and its file.",
  "settings.get": "Read site settings.",
  "settings.update": "Update site settings (partial).",
  "agent.list": "List agents (API-key principals).",
  "agent.create": "Create an agent with scopes. The API key is returned exactly once.",
  "agent.revoke": "Revoke an agent's key permanently.",
  "user.list": "List the site's users with roles.",
  "user.invite": "Invite a user by email with a role. Emails an accept link when email is configured; always returns the link.",
  "user.invites": "List pending invites.",
  "user.revokeInvite": "Revoke a pending invite.",
  "user.updateRole": "Change a user's role.",
  "user.remove": "Remove a user. Their posts stay, attributed to the removed author id.",
  "user.updateProfile": "Update your own name or password (current password required for a password change).",
  "email.status": "Which email driver is configured (console/smtp/resend) and the from address.",
  "email.test": "Send a test email to the given address.",
  "redirect.list": "List redirects (manual, slug-change, import).",
  "redirect.create": "Create a redirect from a path to a path/URL (301 or 302).",
  "redirect.delete": "Delete a redirect.",
  "notfound.list": "Recently hit 404 paths on the public site, with counts.",
  "notfound.clear": "Clear the 404 log (one path or all).",
  "audit.list": "Read the audit log of every tool call (who, via which channel, what).",
  "site.info": "Site overview: settings, content counts, version.",
  "ai.config": "Read the site AI configuration (provider, model, key source). Never returns the key.",
  "ai.configure": "Set provider/model/baseUrl/systemPrompt and optionally store or clear the site API key (BYOK).",
  "ai.models": "List models available from the configured (or given) provider using the resolved key.",
  "ai.test": "Make a tiny request to verify the key + model work. Returns latency.",
  "ai.generate": "Generate Markdown from a prompt, with site context (title, tagline, tags) and optional post context.",
  "ai.rewrite": "Rewrite the given text according to an instruction. Returns only the rewritten text.",
  "ai.draftPost": "Generate a complete post (title, excerpt, Markdown body) from a prompt and save it as a draft.",
  "ai.usage": "AI token usage log with totals. Core records tokens only; pricing is applied by the hosting layer.",
  "chat.threads": "List the current user's site-chat threads.",
  "chat.get": "Fetch one chat thread with its messages, tool calls, and any pending plan.",
  "chat.apply": "Apply approved proposed mutations from a chat message's plan; executes them in order and returns the updated message.",
  "chat.discard": "Reject all pending proposed mutations on a chat message.",
  "chat.delete": "Delete a chat thread.",
  "template.list": "List installed site templates (built-ins).",
  "template.get": "Fetch a full template (design, menus, pages, sample content) for preview.",
  "template.preview": "Dry-run of template.apply: which pages would be created/overwritten, menus set, design changed.",
  "template.apply": "Apply a site template: design, menus, pages (block documents), bundled media, optional sample posts. 'merge' skips existing slugs; 'replace' overwrites them.",
  "template.export": "Export the current site (design, menus, block pages, optionally content) as a reusable template.",
  "import.wordpress": "Import a WordPress WXR export (posts, pages, media, tags/categories, menus, featured images, SEO). Runs as a background job; poll import.status.",
  "import.status": "Progress and report of an import job.",
  "import.list": "Recent import jobs.",
  "export.site": "Export the whole site (settings, design, menus, terms, media list, posts) as JSON.",
  "block.catalog": "List the page block types with descriptions and JSON schemas for their props.",
  "block.validate": "Validate a blocks document; returns it normalized (defaults filled, ids assigned).",
  "ai.generatePage": "Generate a complete page (title + blocks) from a prompt; optionally save it as a draft page.",
  "ai.generateBlock": "Generate one block from a description (e.g. 'pricing with 3 tiers'); the model picks the type unless forced.",
  "ai.editBlock": "Rewrite a block according to an instruction, keeping its type; returns the new block.",
};
