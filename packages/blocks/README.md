# @wove/blocks

The one shared renderer for Wove page blocks. The block schema lives in
`@wove/sdk` (`BlockProps`, `Block`, `BlocksDoc`); this package turns it
into HTML — the same HTML in both consumers.

- **Admin** (React, client-side): `<BlockView block={block} ctx={ctx} />` per
  block on the builder canvas, plus `BLOCK_TYPES`, `BlockMeta`, `blockDefaults`
  and `newBlock` for the picker and insert flow.
- **Site** (Astro, server-side, zero client JS): `<BlockRenderer doc={doc} ctx={ctx} />`
  rendered as a static React island, with `blocks.css` imported from the layout.

Every component is pure and SSR-safe: no hooks, no `window`, no client JS
(the FAQ accordion uses native `<details>`).

```ts
import { BlockRenderer, sampleDoc } from "@wove/blocks";
import "@wove/blocks/blocks.css";
```

`RenderContext` is `{ mediaBase?, linkBase? }`; `resolveUrl` applies `mediaBase`
to `/media/...` paths and `linkBase` to other root-relative links, leaving
absolute urls alone.

## CSS variables

`blocks.css` is plain CSS (no Tailwind, no build plugin). Classes are namespaced
`wv-`. Override any of these on `.wv-blocks`, `.wv-block`, or `:root`:

`--wv-accent` (#2563eb) · `--wv-accent-fg` · `--wv-fg` · `--wv-bg` · `--wv-muted` ·
`--wv-border` · `--wv-subtle` · `--wv-radius` (12px) · `--wv-max` (72rem) ·
`--wv-content` (68ch) · `--wv-pad-y` · `--wv-pad-x` · `--wv-font`

Dark values are applied automatically via `prefers-color-scheme: dark`.
