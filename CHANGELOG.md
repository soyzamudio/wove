# Changelog

Wove is pre-1.0. Until v1.0.0:

- **minor** releases (`0.x.0`) may break things — APIs, tool schemas, config, or data shapes.
- **patch** releases (`0.x.y`) never break anything; they are fixes only.
- any release that ships a **database migration** is at least a minor. Migrations run
  automatically on the next boot, after Wove backs up the SQLite file to `data/backups/`.

Updating: Docker → `docker compose pull && docker compose up -d`; git install → `bun run update`.
See [docs/DEPLOY.md](docs/DEPLOY.md#updating).

## v0.1.1 — 2026-09-02

### Fixes
- chown PaaS-mounted data volumes in a root entrypoint, then drop to the wove user (Railway/Render EACCES)

### Changes
- Railway: add .railway/railway.ts, the only config that can declare the volume
- render.yaml: quote PORT and WOVE_TRUST_PROXY so YAML keeps them strings
- One-click deploys: Render blueprint, Railway config, PaaS site-URL fallback

## v0.1.0 — 2026-09-01

First tagged release. What's in it:

- **Agent-native tool registry + MCP** — every publishing action is a typed, scoped, audited tool;
  the REST API, MCP server, OpenAPI spec, and audit log are all derived from that one registry.
- **Admin** — React SPA served at `/admin`: dashboard, command palette, list/editor views,
  settings, health card.
- **Page builder + blocks** — section-level block documents, a shared renderer, a visual builder in
  the admin, and zero-JS server rendering on the Astro site.
- **AI authoring (BYOK)** — Anthropic, OpenAI, Google, xAI, or any OpenAI-compatible endpoint;
  streaming drafts, rewrites, and whole-page generation with token metering. Keys are stored
  encrypted; no vendor lock-in.
- **Site templates** — pure-data `SiteTemplate` format with four built-ins (Lift, Atelier, Ledger,
  Corner), a live-preview gallery, and import/export.
- **WordPress importer** — background WXR import of posts, pages, media, menus, and SEO
  (idempotent re-runs), plus JSON site export.
- **Collections** — admin-defined content types with runtime-validated entries, generated
  `collection.*`/`entry.*` tools over REST + MCP, generated admin UI and nav, and a `collection` block.
- **Teams, roles, and review** — admin/editor/author/contributor with ownership enforcement,
  invites and password reset over console/SMTP/Resend email, and a pending-review workflow.
- **Redirects + 404 log** — automatic redirects on slug and path changes (descendants included),
  with a 404 log and quick fixes.
- **Menus, design, SEO, media** — drag-ordered menus, Settings → Design with live preview and custom
  CSS, per-post SEO (title/description/OG/noindex), media library with sharp-generated webp variants,
  srcset, and optional S3-compatible storage.
- **Site chat** — an in-admin agent over the tool registry: reads execute, mutations become
  reviewable plans with diffs (⌘J).
- **Production mode + Docker** — single-container deploy (admin at `/admin`, site reverse-proxied),
  Dockerfile/compose/fly, rate limits, retention pruning, secure cookies and headers, graceful
  shutdown.
