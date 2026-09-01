# agentpress

**The CMS for the agentic era.** Open source (Apache-2.0), with a hosted cloud edition.

WordPress made publishing a human-click-through experience. agentpress makes every
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
| `packages/sdk` | shared types + typed client (`@agentpress/sdk`) |
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
