# WordPress feature parity & roadmap

Snapshot: 2026-09-01. Legend — ✅ have · 🟡 partial · ❌ missing · 🧩 plugin territory (deliberately not core)

## 1. Parity matrix

### Content
| WordPress | wove | Notes |
|---|---|---|
| Posts | ✅ | Markdown |
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
| Import from WordPress (WXR) / export | ❌ | **Adoption blocker** |
| Backups | ❌ | Cloud edition; OSS = SQLite file + media dir |
| Cron / scheduled tasks | 🟡 | 30s in-process scheduler for publishing; no general job queue |
| Email notifications | ❌ | |
| Site health / updates | 🟡 | Health card only |
| Multisite | ❌ | Cloud edition handles tenancy |
| i18n (admin) / multilingual content | ❌ | Later |
| Caching / CDN | 🟡 | 10s fetch cache in site; SSR |
| Postgres | ❌ | SQLite only |
| Audit log | ✅ | WP has none in core |
| AI authoring (BYOK, multi-provider, metered) | ✅ | WP has none in core |
| llms.txt / agent-readable site | ✅ | |

## 2. Where wove already beats WordPress
Typed tool registry (REST + MCP + OpenAPI from one source), scoped agent identities, full audit trail, built-in multi-provider AI with metering, AI page builder with schema-validated output, zero-JS SSR pages, single-binary-style Bun deploy, `llms.txt`.

## 3. Proposed roadmap

### Phase A — table stakes (a real site can go live) — ✅ shipped 2026-09-01
1. **Navigation menus** — `menu` tools + admin editor + site header/footer render; AI can "add Pricing to the nav".
2. **Featured image + SEO meta** per post/page (title, description, OG image, noindex) with site output.
3. **Trash / restore**, bulk actions, autosave.
4. **Scheduler** — flips scheduled → published; foundation for agent schedules.
5. **Site design settings** — logo, colors, fonts, custom CSS → CSS variables the blocks already consume; exposed as `design.*` tools.
6. **Image processing** — sharp resizing, srcset, upload size cap; S3-compatible storage driver.
7. **Public search** + RSS feed.

### Phase B — multi-author & adoption
8. **Email layer** (Resend/SMTP driver) → invites, password reset.
9. **Roles**: author, contributor; **pending review** status with approve/reject — the same queue reviews *agent* proposals.
10. **WordPress importer** (WXR → posts/pages/media/tags/users) + JSON export.
11. **Redirects** manager (auto-create on slug change) + 404 log.
12. **Page hierarchy** (parent) + permalink patterns.

### Phase C — the platform play
13. **Collections** (custom content types with schema-defined fields — wove's CPT+ACF): defined in admin or by plugins, auto-get tools/MCP/OpenAPI/list views/blocks.
14. Plugin admin UI extension points, filters, install from admin, registry.
15. Postgres driver; multiple themes; header/footer block areas.

### Phase D — agent-native features WordPress can't do
16. **Site chat** in admin: an in-product agent that uses the tool registry ("create a pricing page, link it in the nav, publish Monday") with a review-before-apply diff.
17. **Agent schedules** ("every Monday draft a post on…") + **webhooks** (post.published → URL).
18. **Semantic search / embeddings** across content — powers public search, related posts, and an agent `content.search` tool.
19. Image generation for blocks; brand voice profile beyond the system prompt.
