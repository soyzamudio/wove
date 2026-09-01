# @agentpress/blocks

The one shared renderer for AgentPress page blocks. The block schema lives in
`@agentpress/sdk` (`BlockProps`, `Block`, `BlocksDoc`); this package turns it
into HTML — the same HTML in both consumers.

- **Admin** (React, client-side): `<BlockView block={block} ctx={ctx} />` per
  block on the builder canvas, plus `BLOCK_TYPES`, `BlockMeta`, `blockDefaults`
  and `newBlock` for the picker and insert flow.
- **Site** (Astro, server-side, zero client JS): `<BlockRenderer doc={doc} ctx={ctx} />`
  rendered as a static React island, with `blocks.css` imported from the layout.

Every component is pure and SSR-safe: no hooks, no `window`, no client JS
(the FAQ accordion uses native `<details>`).

```ts
import { BlockRenderer, sampleDoc } from "@agentpress/blocks";
import "@agentpress/blocks/blocks.css";
```

`RenderContext` is `{ mediaBase?, linkBase? }`; `resolveUrl` applies `mediaBase`
to `/media/...` paths and `linkBase` to other root-relative links, leaving
absolute urls alone.

## CSS variables

`blocks.css` is plain CSS (no Tailwind, no build plugin). Classes are namespaced
`ap-`. Override any of these on `.ap-blocks`, `.ap-block`, or `:root`:

`--ap-accent` (#2563eb) · `--ap-accent-fg` · `--ap-fg` · `--ap-bg` · `--ap-muted` ·
`--ap-border` · `--ap-subtle` · `--ap-radius` (12px) · `--ap-max` (72rem) ·
`--ap-content` (68ch) · `--ap-pad-y` · `--ap-pad-x` · `--ap-font`

Dark values are applied automatically via `prefers-color-scheme: dark`.
