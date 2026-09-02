# Connect your agent to Wove

You don't want to use our agent — you want *your* agent to use your site. That's
Wove's core design: every admin capability is a typed, permissioned, audited tool,
and your agent gets the same tools people use. Sixty seconds:

## 1. Create an agent key

Admin → **Agents → New agent** → name it, pick scopes, copy the key (shown once).

| Scope | Lets the agent |
|---|---|
| `content:read` | read posts, pages, collections |
| `content:write` | create/edit drafts (own content) |
| `content:publish` | publish and schedule |
| `media:read` / `media:write` | browse / upload media |
| `settings:read` / `settings:write` | read / change site settings, menus, design |
| `ai:use` | call the site's built-in AI tools |
| `audit:read` | read the audit log |

Start narrow. An agent with `content:read` + `content:write` (no publish) drafts
into the **pending-review queue** — a human approves everything it writes.

## 2. Point any MCP client at it

```json
{
  "mcpServers": {
    "wove": {
      "url": "https://your-site.com/mcp",
      "headers": { "Authorization": "Bearer wove_..." }
    }
  }
}
```

- **Claude Code**: `claude mcp add --transport http wove https://your-site.com/mcp --header "Authorization: Bearer wove_..."`
- **Claude Desktop / Cursor / anything MCP**: paste the JSON above into its MCP config.

Your agent now sees every tool — `post.create`, `ai.generatePage`, `menu.set`,
`entry.create`, `template.apply`, `import.wordpress`, … — each with a JSON schema
and description. No SDK, no docs-reading required: the catalog *is* the docs.

## 3. Or plain HTTP

Every tool is one POST:

```sh
curl -X POST https://your-site.com/api/tools/post.create \
  -H "Authorization: Bearer wove_..." -H "content-type: application/json" \
  -d '{"title":"Hello","content":"# Hi\n\nWritten by my agent.","status":"draft"}'
```

- `GET /api/tools` — the full catalog with schemas
- `GET /api/openapi.json` — OpenAPI 3.1 for codegen / OpenAPI-native agents

## Discovery

Agents can learn a site's shape before writing to it:

- `collection.list` — custom content types with the JSON schema of their fields
- `block.catalog` — the page-builder block types and their props
- `menu.list`, `design.get`, `site.info` — navigation, design tokens, site meta
- Public, no key needed: `/llms.txt` and `/llms-full.txt` on every Wove site

## Guardrails you get for free

- **Scopes** are enforced per tool call, REST and MCP alike.
- **Audit log**: every action shows *which agent*, via *which channel*, did *what*.
- **Review queue**: without `content:publish`, nothing an agent writes goes live
  until a person approves it.
- **Rate limits**: AI calls are budgeted per agent (`WOVE_AI_RATE_LIMIT`).

Revoke a key any time from the Agents page; revocation is immediate.
