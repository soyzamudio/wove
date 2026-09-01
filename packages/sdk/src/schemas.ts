import { z } from "zod";
import { BlocksDoc, ImageRef, ImageVariant } from "./blocks";

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
  kind: z.enum(["user", "agent", "anon", "system"]),
  id: z.string().nullable(),
  scopes: z.array(Scope),
});
export type Actor = z.infer<typeof Actor>;

export const Channel = z.enum(["ui", "rest", "mcp", "system", "chat"]);
export type Channel = z.infer<typeof Channel>;

// ---------- content ----------
export const PostType = z.enum(["post", "page"]);
export const PostStatus = z.enum(["draft", "pending", "published", "scheduled", "trashed"]);
export const PostFormat = z.enum(["markdown", "blocks"]);
export type PostFormat = z.infer<typeof PostFormat>;

export const Post = z.object({
  id: Id,
  type: PostType,
  slug: Slug,
  title: z.string(),
  content: z.string().describe("Markdown, or the JSON blocks document when format is 'blocks'"),
  format: PostFormat.default("markdown"),
  blocks: BlocksDoc.nullable().describe("parsed blocks document when format is 'blocks'; null otherwise"),
  excerpt: z.string().nullable(),
  featuredImage: ImageRef.nullable().default(null),
  seo: z.object({
    title: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    ogImage: ImageRef.nullable().default(null),
    noindex: z.boolean().default(false),
  }).default({}),
  status: PostStatus,
  parentId: Id.nullable().default(null).describe("pages only: parent page for hierarchy"),
  path: z.string().describe("public path: '/slug' for posts (plus any permalink prefix), '/parent/child' chain for pages"),
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
  format: PostFormat.optional().describe("defaults to 'blocks' when `blocks` is given, else 'markdown'"),
  blocks: BlocksDoc.optional().describe("blocks document; when given, core stores it as content and sets format='blocks'"),
  excerpt: z.string().optional(),
  featuredImage: ImageRef.nullable().optional(),
  seo: z.object({ title: z.string().nullable().optional(), description: z.string().nullable().optional(), ogImage: ImageRef.nullable().optional(), noindex: z.boolean().optional() }).optional(),
  status: PostStatus.default("draft"),
  parentId: Id.nullable().optional().describe("pages only; max depth 3; must not create a cycle"),
  publishedAt: ISODate.optional(),
  meta: z.record(z.unknown()).optional(),
  terms: z.array(z.object({ taxonomy: z.string(), name: z.string() })).optional(),
});
export type PostCreateInput = z.infer<typeof PostCreateInput>;

export const PostUpdateInput = PostCreateInput.partial().extend({ id: Id });
export type PostUpdateInput = z.infer<typeof PostUpdateInput>;

export const PostListInput = z.object({
  type: PostType.optional(),
  status: PostStatus.optional().describe("omit = everything except trashed"),
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
  variants: z.array(ImageVariant).default([]).describe("resized renditions (images only)"),
  createdAt: ISODate,
});
export type Media = z.infer<typeof Media>;

export const Settings = z.object({
  siteTitle: z.string().default("My Wove site"),
  tagline: z.string().default(""),
  siteUrl: z.string().url().default("http://localhost:4321"),
  theme: z.string().default("default"),
  postsPerPage: z.number().int().min(1).max(100).default(10),
  postPermalink: z.enum(["/:slug", "/blog/:slug"]).default("/:slug").describe("public URL pattern for posts; pages always use their hierarchy path"),
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

export const UserRole = z.enum(["admin", "editor", "author", "contributor"]);
export type UserRole = z.infer<typeof UserRole>;
export const User = z.object({ id: Id, email: z.string().email(), name: z.string(), role: UserRole, createdAt: ISODate });
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

// ---------- menus ----------
export const MenuItem: z.ZodType<{ id: string; label: string; href: string; children?: MenuItem[] }> = z.lazy(() =>
  z.object({ id: Id, label: z.string().min(1), href: z.string().min(1), children: z.array(MenuItem).max(20).optional() }),
);
export type MenuItem = { id: string; label: string; href: string; children?: MenuItem[] };
export const MenuLocation = z.string().regex(/^[a-z0-9-]+$/).describe("'header', 'footer', or a custom location");
export const Menu = z.object({ location: MenuLocation, name: z.string(), items: z.array(MenuItem).max(50) });
export type Menu = z.infer<typeof Menu>;

// ---------- design ----------
export const FontChoice = z.enum(["system", "inter", "geist", "source-serif", "playfair", "ibm-plex-sans", "jetbrains-mono", "lora", "space-grotesk"]);
export const Design = z.object({
  logo: ImageRef.nullable().default(null),
  colors: z.object({
    accent: z.string().default("#2563eb"),
    background: z.string().default("#ffffff"),
    foreground: z.string().default("#18181b"),
    darkBackground: z.string().default("#0a0a0a"),
    darkForeground: z.string().default("#f4f4f5"),
  }).default({}),
  fonts: z.object({ heading: FontChoice.default("system"), body: FontChoice.default("system") }).default({}),
  radius: z.number().int().min(0).max(32).default(12),
  customCss: z.string().max(50_000).default(""),
});
export type Design = z.infer<typeof Design>;

/** Font choices → Google Fonts family (null = no download) + CSS stack. Shared by admin preview and site. */
export const FontMeta: Record<z.infer<typeof FontChoice>, { google: string | null; stack: string }> = {
  system: { google: null, stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  inter: { google: "Inter:wght@400;500;600;700", stack: '"Inter", system-ui, sans-serif' },
  geist: { google: "Geist:wght@400;500;600;700", stack: '"Geist", system-ui, sans-serif' },
  "source-serif": { google: "Source+Serif+4:wght@400;600;700", stack: '"Source Serif 4", Georgia, serif' },
  playfair: { google: "Playfair+Display:wght@400;600;700", stack: '"Playfair Display", Georgia, serif' },
  "ibm-plex-sans": { google: "IBM+Plex+Sans:wght@400;500;600;700", stack: '"IBM Plex Sans", system-ui, sans-serif' },
  "jetbrains-mono": { google: "JetBrains+Mono:wght@400;600", stack: '"JetBrains Mono", ui-monospace, monospace' },
  lora: { google: "Lora:wght@400;600;700", stack: '"Lora", Georgia, serif' },
  "space-grotesk": { google: "Space+Grotesk:wght@400;500;600;700", stack: '"Space Grotesk", system-ui, sans-serif' },
};

/** Build the CSS custom properties the blocks renderer and site consume from a Design. */
export function designToCssVars(d: Design): Record<string, string> {
  return {
    "--wv-accent": d.colors.accent,
    "--wv-bg": d.colors.background,
    "--wv-fg": d.colors.foreground,
    "--wv-dark-bg": d.colors.darkBackground,
    "--wv-dark-fg": d.colors.darkForeground,
    "--wv-font": FontMeta[d.fonts.body].stack,
    "--wv-font-heading": FontMeta[d.fonts.heading].stack,
    "--wv-radius": `${d.radius}px`,
  };
}

// ---------- import / export ----------
export const ImportOptions = z.object({
  downloadMedia: z.boolean().default(true).describe("fetch attachments from the old site and store them in the media library"),
  overwrite: z.boolean().default(false).describe("re-import items that already exist (matched by WordPress id); default skips them"),
  dryRun: z.boolean().default(false).describe("parse and report without writing anything"),
  pagesAsBlocks: z.boolean().default(true).describe("import pages as block pages (one Markdown block) so they open in the builder"),
});
export type ImportOptions = z.infer<typeof ImportOptions>;

export const ImportCounts = z.object({
  posts: z.number().int().default(0), pages: z.number().int().default(0), media: z.number().int().default(0),
  terms: z.number().int().default(0), menus: z.number().int().default(0), skipped: z.number().int().default(0), failed: z.number().int().default(0),
});
export const ImportWarning = z.object({ item: z.string().nullable(), message: z.string() });
export const ImportJob = z.object({
  id: Id,
  status: z.enum(["queued", "running", "done", "failed"]),
  phase: z.string().describe("human-readable current step"),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  counts: ImportCounts,
  warnings: z.array(ImportWarning),
  error: z.string().nullable(),
  startedAt: ISODate,
  finishedAt: ISODate.nullable(),
  source: z.object({ siteTitle: z.string().nullable(), siteUrl: z.string().nullable(), items: z.number().int() }),
});
export type ImportJob = z.infer<typeof ImportJob>;

export const SiteExport = z.object({
  version: z.literal(1),
  exportedAt: ISODate,
  settings: Settings,
  design: Design,
  menus: z.array(Menu),
  terms: z.array(Term),
  media: z.array(Media),
  posts: z.array(Post),
});
export type SiteExport = z.infer<typeof SiteExport>;

// ---------- site chat ----------
export const ChatRole = z.enum(["user", "assistant"]);
export const ChatToolCall = z.object({
  id: z.string(),
  tool: z.string(),
  input: z.unknown(),
  kind: z.enum(["read", "mutation"]),
  status: z.enum(["executed", "proposed", "applied", "rejected", "failed"]),
  result: z.unknown().nullable().describe("tool output for executed/applied calls; error message on failed"),
  preview: z.object({ title: z.string(), diff: z.string().nullable() }).nullable().describe("human-readable summary; unified diff for content changes"),
});
export type ChatToolCall = z.infer<typeof ChatToolCall>;

export const ChatMessage = z.object({
  id: Id,
  role: ChatRole,
  content: z.string().describe("assistant/user text (Markdown)"),
  toolCalls: z.array(ChatToolCall).default([]),
  planPending: z.boolean().default(false).describe("true while proposed mutations await approval"),
  usage: AiUsage.nullable().default(null),
  ts: ISODate,
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatThread = z.object({ id: Id, title: z.string(), createdAt: ISODate, updatedAt: ISODate });
export type ChatThread = z.infer<typeof ChatThread>;

// ---------- site templates ----------
export const TemplatePage = z.object({
  slug: Slug,
  title: z.string().min(1),
  blocks: BlocksDoc,
  seo: z.object({ title: z.string().nullable().optional(), description: z.string().nullable().optional() }).optional(),
});
export const TemplateMedia = z.object({ name: z.string(), mime: z.string(), base64: z.string() });
export const SiteTemplate = z.object({
  version: z.literal(1).default(1),
  meta: z.object({
    slug: Slug,
    name: z.string().min(1),
    description: z.string().default(""),
    author: z.string().default(""),
    templateVersion: z.string().default("1.0.0"),
  }),
  design: Design,
  menus: z.array(Menu).default([]),
  settings: Settings.pick({ siteTitle: true, tagline: true }).partial().optional(),
  pages: z.array(TemplatePage).min(1),
  samplePosts: z.array(z.object({
    slug: Slug, title: z.string(), content: z.string().describe("Markdown"),
    excerpt: z.string().optional(), terms: z.array(z.object({ taxonomy: z.string(), name: z.string() })).optional(),
  })).default([]),
  media: z.array(TemplateMedia).default([]).describe("bundled assets; page image URLs reference them as template://<name>"),
});
export type SiteTemplate = z.infer<typeof SiteTemplate>;

export const TemplateSummary = z.object({
  slug: Slug, name: z.string(), description: z.string(), author: z.string(), templateVersion: z.string(),
  pages: z.number().int(), source: z.enum(["builtin"]),
});
export type TemplateSummary = z.infer<typeof TemplateSummary>;

export const TemplateApplyReport = z.object({
  createdPages: z.array(Slug), overwrittenPages: z.array(Slug), skippedPages: z.array(Slug),
  createdPosts: z.array(Slug), menusSet: z.array(z.string()), designApplied: z.boolean(),
  settingsApplied: z.boolean(), mediaUploaded: z.number().int(),
});
export type TemplateApplyReport = z.infer<typeof TemplateApplyReport>;

// ---------- invites & email ----------
export const Invite = z.object({
  id: Id, email: z.string().email(), role: UserRole, invitedBy: Id.nullable(),
  expiresAt: ISODate, createdAt: ISODate,
});
export type Invite = z.infer<typeof Invite>;

export const EmailStatus = z.object({
  driver: z.enum(["console", "smtp", "resend"]),
  from: z.string(),
  configured: z.boolean().describe("false when the console driver is active (emails only logged)"),
  source: z.enum(["dashboard", "env", "none"]).describe("where the active config came from; 'none' = console fallback"),
  secretHint: z.string().nullable().describe("masked tail of the stored dashboard secret, null otherwise"),
});
export type EmailStatus = z.infer<typeof EmailStatus>;

// ---------- redirects & 404s ----------
export const Redirect = z.object({
  id: Id,
  fromPath: z.string().regex(/^\/[^\s]*$/, "must start with /"),
  toPath: z.string().min(1).describe("path or absolute URL"),
  code: z.union([z.literal(301), z.literal(302)]).default(301),
  source: z.enum(["manual", "slug-change", "import"]).default("manual"),
  hits: z.number().int().default(0),
  createdAt: ISODate,
});
export type Redirect = z.infer<typeof Redirect>;

export const NotFoundEntry = z.object({ path: z.string(), count: z.number().int(), lastSeen: ISODate, referrer: z.string().nullable() });
export type NotFoundEntry = z.infer<typeof NotFoundEntry>;

// ---------- collections ----------
export const CollectionFieldType = z.enum(["text", "textarea", "markdown", "number", "boolean", "date", "select", "image", "url"]);
export type CollectionFieldType = z.infer<typeof CollectionFieldType>;

export const CollectionField = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "lowercase snake_case key"),
  label: z.string().min(1),
  type: CollectionFieldType,
  required: z.boolean().default(false),
  options: z.array(z.string().min(1)).optional().describe("select fields only"),
  help: z.string().optional(),
});
export type CollectionField = z.infer<typeof CollectionField>;

export const Collection = z.object({
  slug: Slug,
  name: z.string().min(1),
  namePlural: z.string().min(1),
  icon: z.string().default("database").describe("lucide icon name"),
  fields: z.array(CollectionField).min(1).max(30),
  titleFieldKey: z.string().describe("key of a text field used as the entry's display title"),
  public: z.boolean().default(false).describe("expose published entries on the public API/site"),
  createdAt: ISODate,
  updatedAt: ISODate,
});
export type Collection = z.infer<typeof Collection>;

export const CollectionEntry = z.object({
  id: Id,
  collection: Slug,
  status: z.enum(["draft", "published"]).default("draft"),
  data: z.record(z.unknown()).describe("field values keyed by field key; validated against the collection's fields"),
  authorId: Id.nullable(),
  createdAt: ISODate,
  updatedAt: ISODate,
});
export type CollectionEntry = z.infer<typeof CollectionEntry>;
