# Contributing to Wove

Thanks for helping build the CMS for the agentic era.

## Setup
```sh
bun install
bun run --cwd packages/core seed   # admin@example.com / admin1234
bun run dev:core                   # :4000  API + MCP
bun run dev:admin                  # :5173
bun run dev:site                   # :4321
```

## Layout
`packages/sdk` is the contract (zod schemas + `ToolCatalog`). Everything else — core, admin, site, blocks — builds against it.
**Adding a feature = adding a tool**: declare it in `ToolCatalog` (+ a description), implement it in `packages/core/src/tools/`, and it is automatically available over REST, MCP, OpenAPI, and the audit log. Then wire the UI.

## Before you open a PR
```sh
bun run typecheck && bun run test
```
Add tests next to the code (`*.test.ts`). Keep PRs focused; describe the user-visible change in the PR body.

## Principles
- Humans and agents are peers: nothing the UI can do should be hidden from agents.
- Core records facts (tokens, actions); pricing and tenancy live in the hosted edition, never in core.
- Prefer section-level blocks and typed props over free-form nesting.

## License
By contributing you agree your contributions are licensed under Apache-2.0.
