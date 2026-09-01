# agentpress cloud (hosted edition) — design

Status: **design only**. Nothing here runs yet. The open-source core must be complete on its own;
cloud adds *operations and multi-tenancy*, never features gated from OSS (open-core, not crippleware).

## What cloud sells
1. Zero-ops hosting: one click → a running agentpress site with backups, TLS, custom domain.
2. Managed agent access: rate-limited MCP endpoint per site, key rotation, usage dashboards.
3. Org features: multiple sites per org, team members, SSO, audit export/retention.
4. Metered AI usage (if/when built-in AI authoring lands in core, cloud bundles credits).

## Tenancy model (phase 1)
- **One core process per site**, SQLite on a persistent volume (Fly.io machines or similar).
  Simple, strong isolation, cheap idle (machines stop when idle; cold start ≈ Bun boot ≈ <300 ms).
- Control plane (`apps/cloud/api`, also Bun+Hono+Drizzle on Postgres): orgs, users, sites, domains,
  billing (Stripe), provisioning (create volume + machine, set `AGENTPRESS_*` env), backups (Litestream → S3).
- Router/edge: wildcard `*.agentpress.app` + custom domains → site machine. Cache public GETs at edge.
- Phase 2 (if density matters): Postgres schema-per-tenant using core's Postgres driver.

## Boundaries with core
Core must expose (all in OSS): `/health`, `/api/public/*`, `/mcp`, env-based config
(`AGENTPRESS_DB`, `AGENTPRESS_MEDIA_DIR`/S3 vars, `AGENTPRESS_SITE_URL`), and an `admin bootstrap token`
mechanism so cloud can create the first admin without a password round-trip.

## Not yet decided
- Pricing (per-site vs per-org seats). Leaning: free tier 1 site, paid per site + agent-call overage.
- Whether the Astro site renderer runs in the same machine as core (simplest; yes for phase 1).

## AI billing (builds on core's `ai_usage`)
Per site: **"use my key"** (BYOK — core already handles it; cloud bills nothing) or **"bill me"** — the control plane injects `AGENTPRESS_AI_<PROVIDER>_KEY` as env for the site's process, and periodically reads `ai_usage` rows where `keySource = platform`, prices them by (provider, model) from a cloud-owned price table with margin, and reports to Stripe metered billing. Per-site monthly token cap → core returns a budget-exceeded error when the cloud sets `AGENTPRESS_AI_BUDGET_TOKENS` (TODO in core). Price table never lives in core.
