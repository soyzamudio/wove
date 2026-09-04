## What does this change?

<!-- One or two sentences. What can a user (or an agent) do now that they couldn't? -->

## Checklist

- [ ] `bun run typecheck` and `bun run test` pass at the repo root
- [ ] Tests added/updated next to the code (`*.test.ts`)
- [ ] Conventional commit title (`feat:`, `fix:`, `feat!:` for breaking) — it drives the release version
- [ ] **If `packages/sdk` changed**: the tool catalog and `ToolDescriptions` stay in sync (the sdk contract test enforces it), and this is at least a minor release
- [ ] **If a DB migration was added**: generated with `bun run --cwd packages/core db:generate` (never hand-edited), and this is at least a minor release
- [ ] New admin actions are exposed as tools first (REST + MCP), UI second — see CONTRIBUTING.md

## Screenshots

<!-- For admin/site UI changes. Delete if not applicable. -->
