# Architecture

## Principle: tools, not routes

The unit of functionality is a **tool**: `{ name, description, input: zod, output: zod, scopes, handler }`.
Tools are registered in `packages/core/src/tools/`. From one registry we derive:

1. REST — `POST /api/tools/:name` (plus conventional GET/PUT routes for reads/CRUD)
2. MCP — every tool is an MCP tool at `/mcp` (Streamable HTTP)
3. OpenAPI — `GET /api/openapi.json`
4. Audit — the dispatcher logs every call (actor, channel, input hash, result)

The admin UI is *just another client* of the same tools. Nothing the UI can do is hidden from agents.

## Actors & auth

- `users` (humans) — email + password session cookie (`wove_session`).
- `agents` — API keys (`Authorization: Bearer wove_...`), created by a user, with **scopes** (`content:read`, `content:write`, `media:write`, `settings:write`, `agents:manage`, `*`).
- Every request resolves to an `Actor = { kind: 'user'|'agent'|'anon', id, scopes }`.

## Content model (v1)

- `posts` — `{ id, type: 'post'|'page', slug, title, content (Markdown/MDX), excerpt, status: draft|published|scheduled, authorId, publishedAt, meta jsonb }`
- `terms` + `post_terms` — tags & categories (`taxonomy` column)
- `media` — files on local disk (`./data/media`) or S3-compatible; `{ id, path, mime, size, alt, width, height }`
- `settings` — key/value jsonb (site title, theme, url)
- `revisions` — full snapshot per post write
- `audit_log` — `{ actorKind, actorId, channel: ui|rest|mcp, tool, input, ok, error, ts }`
- `agents` — `{ id, name, keyHash, scopes, createdBy, lastUsedAt }`

Content is Markdown (+ frontmatter-free; meta lives in DB). Rationale: agents read/write Markdown natively; no block-JSON lock-in.

## Hooks / plugins (v1 minimal)

`core.hooks.on('post.beforeSave' | 'post.afterSave' | 'post.publish' | 'media.afterUpload', fn)`.
Plugins are TS modules exporting `definePlugin({ name, tools?: Tool[], hooks?: {...} })`, loaded from `plugins/*.ts`. A plugin can therefore add new tools, which automatically become MCP/REST/audited.

## Public rendering

`packages/site` (Astro) fetches from core's public read API (`GET /api/public/...`), renders statically or SSR. Theme = Astro components under `src/theme/`. Also emits `/llms.txt` and `/feed.json`.

## Hosted edition (apps/cloud) — design only

Multi-tenant control plane: one core process per tenant DB (SQLite on volume → Postgres schema-per-tenant later), org/billing (Stripe), custom domains, managed backups. Open-source core stays complete; cloud adds ops + multi-tenancy, not features.

## Ports

core `4000` · admin `5173` · site `4321`

## AI authoring

Built-in, provider-agnostic, and exposed as tools (`ai.*`) so agents get the same capability over MCP.

**Providers** via official SDKs only: `@anthropic-ai/sdk` (Anthropic), `openai` (OpenAI, xAI/Grok, and any OpenAI-compatible endpoint such as Ollama/LM Studio/OpenRouter via `baseUrl`), `@google/genai` (Google). Adapters live in `packages/core/src/ai/providers/`; each implements `generate`, `stream`, `listModels`.

**Key resolution** (per call): site key (BYOK, stored AES-256-GCM-encrypted under `WOVE_SECRET`) → platform key from `WOVE_AI_<PROVIDER>_KEY` → none (actionable error). `ai.config` reports `keySource: byok | platform | none` and a masked hint; the key is never returned.

**Metering**: every provider call writes an `ai_usage` row (actor, channel, tool, provider, model, input/output tokens, keySource, duration, ok). Core records **tokens only — no prices**. The OSS admin shows totals; the cloud edition prices `keySource=platform` rows.

**Surfaces**: `ai.generate` / `ai.rewrite` (text), `ai.draftPost` (creates a draft), `ai.config` / `ai.configure` / `ai.models` / `ai.test` (setup), `ai.usage` (metering); plus `POST /api/ai/stream` (SSE) for the editor. Scope `ai:use` gates generation.

## Pages: blocks + AI page builder

Posts are Markdown; **pages are block documents** (`post.format = "blocks"`, `post.blocks: { version: 1, blocks: Block[] }`, stored as JSON in `content`). Blocks are **section-level** (hero, features, markdown, image, gallery, cta, testimonials, logos, faq, stats, columns, html) with typed props — the schema lives in `packages/sdk/src/blocks.ts` and is the single source of truth for validation, AI structured output, the builder, and rendering.

**One renderer**: `packages/blocks` (`@wove/blocks`) holds the React components + plain CSS (`wv-*` classes, CSS variables). The admin canvas renders it client-side; Astro renders the same components server-side with no client JS. Preview = production.

**Editing**: the whole document is replaced via `post.update { blocks }` — atomic, easy to audit and revise. `block.catalog` exposes the block types + JSON schemas so agents can discover them; `block.validate` normalizes a doc.

**AI**: `ai.generatePage` (prompt → title + blocks, optional save as draft page), `ai.generateBlock` (description → one block, type chosen or forced), `ai.editBlock` (block + instruction → block). Outputs are validated against the zod schema with one retry that feeds back the validation errors. Image URLs are never invented by the model; users attach media in the builder.

## Site chat (in-admin agent)

A conversational agent inside the admin that operates the site through the same tool registry — "create a pricing page, link it in the nav, and publish it Monday".

**Loop** (`packages/core/src/chat/`): the configured AI provider is called with tool definitions derived from the registry (the actor's scopes filter the list; `html` block and destructive `permanent` deletes are excluded). Provider adapters gain a `chat()` method that supports native tool calling (Anthropic `tools`, OpenAI `tools`, Google function declarations). The server runs the agentic loop:

- **Reads execute immediately** (`*.list`, `*.get`, `block.catalog`, `site.info`, …) and their results go back to the model.
- **Mutations are never executed by the model.** They are collected into a **plan** — an ordered list of proposed tool calls with arguments — that the loop returns to the user. The user approves all or some; `chat.apply` dispatches them in order (channel `chat`, actor = the human, audited), then the results are fed back so the model can confirm or continue.
- Dry-run helpers make plans reviewable: for `post.update` the plan carries a before/after diff; `ai.generatePage` runs at plan time (it's a read from the site's point of view) so the user reviews the *actual* page before `post.create` is applied.

**Persistence**: `chat_threads { id, title, actorId, createdAt, updatedAt }`, `chat_messages { id, threadId, role: user|assistant|tool, content (text or JSON parts), plan (json|null), ts }`. Threads are per user.

**Surfaces**: `POST /api/chat/stream` (SSE: `token`, `tool_call`, `tool_result`, `plan`, `done`, `error`), tools `chat.threads`, `chat.get`, `chat.apply { threadId, messageId, approve: callIds[] }`, `chat.discard`, `chat.delete`. Channel enum gains `chat`.

**Admin**: a slide-over panel available on every page (⌘J): streaming replies, tool-call cards (reads collapsed, mutations as approval cards with diff/preview), Approve all / individual, and links to what was created. Usage is metered like every other AI call.

## Site templates

A template is **pure data** — no executable code, unlike WordPress themes: `SiteTemplate = { meta, design, menus, settings?, pages[] (block documents), samplePosts[], media[] }` (schema in `packages/sdk`). Bundled images use a `template://<name>` scheme rewritten to real media URLs on apply.

Tools: `template.list` / `template.get` (built-ins shipped in `packages/core/src/templates/`), `template.preview` (dry-run report), `template.apply` (merge = skip existing slugs, replace = overwrite; sample content opt-in; everything flows through the normal tool handlers so hooks/validation/audit apply), `template.export` (the current site becomes a template — the seed of a marketplace where every user is an author). The admin gallery renders live previews with the shared block renderer under each template's own design tokens — no screenshot pipeline.

Because templates can't execute code, a future marketplace can review submissions cheaply and buyers can't be broken by an update — the "it just works" property is structural.
