# Wove

**The CMS for the agentic era.** · https://usewove.com — https://usewove.com Open source (Apache-2.0), with a hosted cloud edition.

WordPress made publishing a human-click-through experience. Wove makes every
admin action a typed, permissioned, auditable **tool** — usable by humans through the
admin UI *and* by AI agents through MCP and REST, on equal footing.

- **Agent-native core** — every mutation is a tool with a JSON schema, exposed over MCP + REST.
- **Fast by default** — Bun + Hono API; Astro-rendered public sites (zero JS unless you opt in).
- **Portable data** — SQLite for `bun run start` simplicity, Postgres for scale. Drizzle ORM.
- **Auditable** — every write records *who* (human or agent), *via what* (UI/API/MCP), *what changed*.

## Layout

| path | what |
|---|---|
| `packages/core` | API server, DB schema, auth, hooks, MCP server |
| `packages/sdk` | shared types + typed client (`@wove/sdk`) |
| `packages/admin` | React admin UI |
| `packages/site` | Astro public-site renderer + default theme |
| `apps/cloud` | hosted multi-tenant control plane (design only for now) |
| `docs/` | architecture + ADRs |

## Quick start

```sh
bun install
bun run dev:core   # http://localhost:4000  (API + MCP)
bun run dev:admin  # http://localhost:5173
bun run dev:site   # http://localhost:4321
```

See `docs/ARCHITECTURE.md`.

## Site rendering

`packages/site` renders posts and pages server-side with zero client JS by
default. A post/page with `format: "markdown"` renders through the existing
Markdown pipeline; one with `format: "blocks"` is rendered by
`@wove/blocks`'s `<BlockRenderer>` (a server-only React island — no
`client:*` directive, so no hydration script ships). If a published page with
slug `home` exists, it renders at `/` (blocks or markdown, whichever its
format is); the paginated post listing that used to live at `/` moved to
`/blog`, linked from the site nav. If no `home` page exists, `/` keeps
showing the listing as before. `llms.txt`, `llms-full.txt`, and `feed.json`
derive readable text from blocks documents via `blocksToMarkdown`
(`packages/site/src/lib/blocks-text.ts`) so agents get the same content
whether a page is Markdown or blocks.
