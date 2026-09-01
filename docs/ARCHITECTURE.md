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

- `users` (humans) — email + password session cookie (`ap_session`).
- `agents` — API keys (`Authorization: Bearer ap_...`), created by a user, with **scopes** (`content:read`, `content:write`, `media:write`, `settings:write`, `agents:manage`, `*`).
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

**Key resolution** (per call): site key (BYOK, stored AES-256-GCM-encrypted under `AGENTPRESS_SECRET`) → platform key from `AGENTPRESS_AI_<PROVIDER>_KEY` → none (actionable error). `ai.config` reports `keySource: byok | platform | none` and a masked hint; the key is never returned.

**Metering**: every provider call writes an `ai_usage` row (actor, channel, tool, provider, model, input/output tokens, keySource, duration, ok). Core records **tokens only — no prices**. The OSS admin shows totals; the cloud edition prices `keySource=platform` rows.

**Surfaces**: `ai.generate` / `ai.rewrite` (text), `ai.draftPost` (creates a draft), `ai.config` / `ai.configure` / `ai.models` / `ai.test` (setup), `ai.usage` (metering); plus `POST /api/ai/stream` (SSE) for the editor. Scope `ai:use` gates generation.
