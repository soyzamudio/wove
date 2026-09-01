# WordPress feature parity & roadmap

Snapshot: 2026-09-01 (updated end of day). Legend — ✅ have · 🟡 partial · ❌ missing · 🧩 plugin territory (deliberately not core)

## 1. Parity matrix

### Content
| WordPress | wove | Notes |
|---|---|---|
| Posts | ✅ | Markdown under the hood; WYSIWYG editor (raw-MD toggle) |
| Pages | ✅ | Block documents + visual builder |
| Block editor (Gutenberg) | ✅ | Section-level blocks, AI-augmented; posts stay Markdown by design |
| Revisions | ✅ | Every update; restore via UI |
| Draft / Published / Scheduled | ✅ | In-process scheduler flips due posts (audited as `system`) |
| Pending review workflow | ❌ | Needed for multi-author *and* for agent-proposed changes |
| Categories & tags | ✅ | Custom taxonomies ❌ |
| Custom post types + custom fields (CPT/ACF) | ❌ | The "WordPress as app platform" backbone — see §3 |
| Featured image | ✅ | Editor rail + site output with srcset |
| Excerpts | ✅ | Derived for block pages |
| Permalinks | 🟡 | Flat `/slug`; no structure settings, no page hierarchy/parent |
| Trash (soft delete) + restore | ✅ | `post.delete` trashes; `permanent:true` purges |
| Bulk / quick edit | 🟡 | Bulk trash/restore/publish/draft/delete; no quick edit |
| Sticky posts, post formats | ❌ | Low value |
| Private / password-protected posts | ❌ | |
| Autosave / draft recovery | ✅ | Local (browser) recovery in both editors |
| Search (admin + public) | ✅ | `/search` + `/api/public/search` |

### Media
| WordPress | wove | Notes |
|---|---|---|
| Media library, uploads, alt text | ✅ | Base64 upload; no size cap yet |
| Image sizes / thumbnails / srcset | ✅ | sharp → webp 480/960/1600 + original; srcset everywhere |
| Image editing (crop/rotate) | ❌ | |
| oEmbed (YouTube, X…) | ❌ | Markdown + `html` block cover it manually |
| Cloud storage (S3) | ✅ | `WOVE_STORAGE=s3` (Bun S3 client; R2/MinIO via endpoint) |

### Users & access
| WordPress | wove | Notes |
|---|---|---|
| Roles: admin/editor/author/contributor/subscriber | 🟡 | admin + editor only; no author (own-posts-only) |
| Invites, registration, password reset, profile | ❌ | No email layer at all |
| Application passwords (API access) | ✅ | Agents with scopes — stronger than WP |
| 2FA | ❌ | |
| Capabilities system | ✅ | Scopes; per-tool, exposed to agents |

### Appearance
| WordPress | wove | Notes |
|---|---|---|
| Themes (multiple, switchable) | 🟡 | One default code theme; **data templates** (design+menus+pages) shipped with 4 built-ins + import/export — the Envato-style story |
| Customizer / global styles (colors, fonts, logo) | ✅ | Settings → Design with live preview; `design.*` tools |
| Navigation menus | ✅ | Menus page (drag tree, one level); `menu.*` tools |
| Widgets / sidebars | ❌ | Replace with block areas (header/footer) |
| Block patterns | 🟡 | Templates in builder empty state; no user-saved patterns |
| Custom CSS | ✅ | Part of Design |
| Site editor (FSE) | 🟡 | Pages yes; header/footer/blog templates no |

### Engagement
| WordPress | wove | Notes |
|---|---|---|
| Comments + moderation + spam | 🧩 | Optional plugin; many modern sites don't want it |
| Pingbacks/trackbacks | ❌ | Dead tech; skip |
| Forms | 🧩 | Plugin with a `form` block |
| Newsletter | 🧩 | |

### Platform
| WordPress | wove | Notes |
|---|---|---|
| Plugin system (hooks/filters) | 🟡 | TS plugins add tools + 4 hooks; no filters, no admin UI extension points, no install-from-admin |
| Shortcodes | ❌ | Blocks replace them |
| REST API | ✅ | Plus OpenAPI |
| MCP | ✅ | Unique |
| RSS / JSON Feed | ✅ | `/rss.xml` + `/feed.json` |
| Sitemap | ✅ | |
| SEO meta (title/description/OG image) per post | ✅ | Title/description/OG/noindex + search preview |
| Redirects / 404 log | ❌ | |
| Import from WordPress (WXR) / export | ✅ | Background job: posts/pages/media/menus/SEO, idempotent re-runs; JSON site export |
| Backups | 🟡 | Docker volume + `data/` dir documented in DEPLOY.md; managed backups = cloud edition |
| Cron / scheduled tasks | 🟡 | 30s in-process scheduler for publishing; no general job queue |
| Email notifications | ❌ | |
| Site health / updates | 🟡 | Health card, /health endpoint, single-container deploy (Docker/compose/fly) |
| Multisite | ❌ | Cloud edition handles tenancy |
| i18n (admin) / multilingual content | ❌ | Later |
| Caching / CDN | 🟡 | 10s fetch cache in site; SSR |
| Postgres | ❌ | SQLite only |
| Audit log | ✅ | WP has none in core |
| AI authoring (BYOK, multi-provider, metered) | ✅ | WP has none in core |
| llms.txt / agent-readable site | ✅ | |

## 2. Where wove already beats WordPress
Typed tool registry (REST + MCP + OpenAPI from one source), scoped agent identities, full audit trail, built-in multi-provider AI with metering, AI page builder with schema-validated output, zero-JS SSR pages, single-binary-style Bun deploy, `llms.txt`.

## 3. Roadmap

### Shipped ✅
- **Phase A** (2026-09-01): menus, featured image + SEO, trash/bulk/autosave, scheduler, design settings, image variants + S3, public search + RSS.
- **WordPress importer (WXR)** + JSON site export — the adoption path.
- **Production mode**: single container (admin at `/admin`, site reverse-proxied), Dockerfile/compose/fly, rate limits, retention pruning, secure cookies/headers, graceful shutdown, `docs/DEPLOY.md`.
- **Site chat**: in-admin agent over the tool registry — reads execute, mutations become reviewable plans with diffs (⌘J).
- **WYSIWYG editor** everywhere prose is edited; storage stays Markdown.
- **Site templates**: pure-data `SiteTemplate` format, 4 built-ins (Lift, Atelier, Ledger, Corner), live-preview gallery, import/export, `template.*` tools.

### Phase B — teams & trust (next)
1. **Email layer** (SMTP/Resend driver) → invites, password reset, notifications.
2. **Roles**: author, contributor; **pending review** status with approve/reject — doubles as the approval queue for agent-written content.
3. **Redirects** manager (auto-created on slug change, importer-aware) + 404 log.
4. **Page hierarchy** (parent) + permalink patterns.

### Phase C — the platform play
5. **Collections** — schema-defined custom content types (events, products, team…) that automatically get tools/MCP/OpenAPI/list views and a block to render them (the CPT+ACF replacement).
6. Plugin maturity: filters, admin UI extension points, install from admin, a registry.
7. **Postgres driver**; multiple code themes; header/footer block areas; container queries in blocks.css (true mobile preview).

### Phase D — only Wove can do this
8. ~~Site chat~~ ✅ shipped.
9. **Agent schedules** ("every Monday draft…") + **webhooks** (post.published → URL).
10. **Semantic search / embeddings** — public search, related posts, and a `content.search` tool for agents.
11. Image generation for blocks; brand voice profile.

### Marketplace (with the cloud edition)
12. Template registry on usewove.com — browse/purchase → the JSON applies; `template.export` already makes every user an author. Review is cheap because templates are data, not code.
