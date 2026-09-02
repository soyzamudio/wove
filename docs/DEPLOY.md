# Deploying Wove

Wove ships as a single container: core (API + MCP), the admin SPA (served
under `/admin`), and the Astro public site (reverse-proxied for every
non-API route) all run behind one port.

## Run with Docker

```sh
export WOVE_SECRET=$(openssl rand -hex 32)
export WOVE_SITE_URL=https://your-domain.example
docker compose up -d
```

Then open `https://your-domain.example/admin` (or `http://localhost:4000/admin`
if you're not behind a reverse proxy yet) — first run walks you through
creating the admin account. The public site is at `/`.

**Where data lives**: everything Wove writes — the SQLite database and
locally-stored media — lives under `/app/packages/core/data` inside the
container, which `docker-compose.yml` mounts as the `wove-data` named volume.

**Backups**: stop the container (or just accept a brief write-lock window)
and copy the volume, or copy `data/wove.db*` and `data/media/` directly:

```sh
docker run --rm -v wove_wove-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/wove-backup.tar.gz -C /data .
```

Restore by extracting that tarball back into the volume the same way, in reverse.

## One-click deploys

Two hosts can bring Wove up from a button. Both run the same published image
(`ghcr.io/soyzamudio/wove:latest`) as a single container.

> ### ⚠️ Attach a volume, or lose your site
>
> Everything Wove writes — the SQLite database *and* locally-stored media —
> lives in one directory: **`/app/packages/core/data`**. Render and Railway both
> give containers an ephemeral filesystem. **With no persistent volume mounted
> at that path, every redeploy, restart, or platform-side machine move deletes
> every post, page, and upload.** There is no warning and no recovery. The
> Render blueprint below declares the disk for you; on Railway you must attach
> the volume yourself (see the walkthrough) — Railway cannot declare volumes in
> a repo config file.
>
> Persistent disks are a paid feature on Render — the free plan cannot mount one,
> which is why the blueprint asks for `starter`. Deploying Wove to a free,
> diskless instance is a demo, not a site.

### Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/soyzamudio/wove)

Live today, no extra setup: the button points at
`https://render.com/deploy?repo=https://github.com/soyzamudio/wove`, and Render
reads [`render.yaml`](../render.yaml) from the repo root
([Blueprint spec](https://render.com/docs/blueprint-spec)). That blueprint
declares:

- a `runtime: image` web service on `ghcr.io/soyzamudio/wove:latest`, `plan: starter`;
- a 2 GB disk named `wove-data` mounted at `/app/packages/core/data`;
- `healthCheckPath: /health`;
- `WOVE_SECRET` with `generateValue: true` — Render generates a random 256-bit
  value once and keeps it stable across deploys (changing it later makes stored
  AI keys undecryptable);
- `PORT=4000`. Render's own default is `PORT=10000` and it will usually
  auto-detect whatever port you bind, but pinning it matches the port the image
  `EXPOSE`s. Core reads `$PORT` either way, so both values work.
- `WOVE_TRUST_PROXY=1`, since Render terminates TLS in front of the container.

`WOVE_SITE_URL` is deliberately left unset: core falls back to Render's injected
`RENDER_EXTERNAL_URL`, so CORS, `Secure` cookies, and invite/reset links are
correct on the `*.onrender.com` URL from the first boot. Set it explicitly once
you point a custom domain at the service.

Optional AI keys are commented out in the blueprint with `sync: false`, which
makes Render prompt for the value during the initial Blueprint flow instead of
committing it. Note that Render **does not** auto-redeploy when a new image is
pushed to the same tag — redeploy from the dashboard, a deploy hook, or the API.

### Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new)

Railway works today via **New Project → Deploy from GitHub repo** (or **Deploy a
Docker image** with `ghcr.io/soyzamudio/wove:latest`). The button above links to
`https://railway.com/new` because a *true* one-click Railway link requires a
**published template** — there is no documented URL that deploys an arbitrary
public GitHub repo in one hop. Publishing one takes about five minutes; the
walkthrough is below.

The repo carries two Railway configs, because neither one alone does the job:

**[`.railway/railway.ts`](../.railway/railway.ts)** — the current
[Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
format, and **the only Railway config that can declare the volume**. It defines
the service from the GHCR image, the `/health` check, one replica, and a 2 GB
volume mounted at `/app/packages/core/data`. IaC is CLI-driven — a git push does
*not* apply it:

```sh
npm install railway          # provides the `railway/iac` module
railway login && railway link
railway config plan          # preview
railway config apply         # apply after confirmation
```

It leaves `WOVE_SECRET` unset on purpose: core generates one on first boot into
`data/secret`, which is on the volume, so it survives redeploys without being
stored anywhere. `WOVE_SITE_URL` is unset too — core falls back to Railway's
`RAILWAY_PUBLIC_DOMAIN`.

**[`railway.json`](../railway.json)** — the older repo config-as-code, kept for
existing services. It sets the healthcheck, the restart policy (`ON_FAILURE`, 10
retries — a knob IaC does not document at the DSL level) and asserts the
required mount path.

Two caveats, both confirmed against Railway's own docs:

- **Volumes cannot be declared in `railway.json`.** The
  [schema](https://railway.com/railway.schema.json) has no volume key; the
  closest thing, `deploy.requiredMountPath`, only *asserts* that a mount is
  required — it does not create one. Volumes come from the dashboard,
  `railway volume add --mount-path …`, the template composer, or IaC.
  `railway.json` also cannot point at a prebuilt image — there is no `image`
  key — which is why it builds the Dockerfile instead.
- **`railway.json` / `railway.toml` config-as-code is deprecated.** Railway's
  [IaC docs](https://docs.railway.com/infrastructure-as-code) state new services
  cannot opt into it and that existing files **stop being read on 2026-12-01**.
  Use `.railway/railway.ts` for anything new; use the template below for a
  genuine one-click button.

#### Publishing a Wove template on Railway

Do this once from your own Railway account, then paste the resulting URL into
the README and the landing page (both currently carry a `TODO` comment).

1. Go to **Workspace Settings → Templates → New Template** to open the template
   composer. (If you already have a working Wove project, project **Settings →
   Generate Template from Project** is the faster start.)
2. Add a service and set its source to **Docker Image**:
   `ghcr.io/soyzamudio/wove:latest`.
3. **Right-click the service → Attach Volume**, and set the mount path to
   **`/app/packages/core/data`**. This is the step that makes the deploy durable —
   do not skip it.
4. Add the environment variables `WOVE_ENV=production`, `WOVE_TRUST_PROXY=1`
   and `PORT=4000`. Leave **`WOVE_SITE_URL` unset** — core falls back to
   `RAILWAY_PUBLIC_DOMAIN`. Leave **`WOVE_SECRET` unset** too: core generates one
   on first boot into `data/secret`, which lives on the volume you just
   attached, so it persists across redeploys with no template plumbing. (If you
   would rather have Railway mint it, the template composer's variable editor
   offers a generated value — the equivalent of Render's `generateValue: true`.)
5. Set the service's healthcheck path to `/health` and generate a public domain
   for it.
6. Click **Publish** and fill out the template form.
7. Copy the template code from the published URL and build the button link:
   `https://railway.com/new/template/<CODE>?utm_medium=integration&utm_source=button&utm_campaign=wove`
8. Replace `https://railway.com/new` in `README.md` and in usewove.com's
   `site/src/pages/index.astro` with that URL, and delete the `TODO` comments.

### Other platforms

Heroku-, Vercel-, and Netlify-class platforms are not viable targets yet: they
offer no persistent filesystem at all, and Wove currently stores content in
SQLite on disk. They become one-click targets once the **Postgres driver** lands
(Phase C item 7 on the [roadmap](ROADMAP.md)) and media moves to S3 — at which
point the container is fully stateless. Until then, `WOVE_STORAGE=s3` removes
the media half of the problem but the database still needs a disk.

## Run on a VPS without Docker

```sh
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/soyzamudio/wove.git && cd wove
bun install
bun run build
WOVE_ENV=production WOVE_SITE_URL=https://your-domain.example WOVE_SECRET=... bun run start
```

`bun run start` runs `scripts/start.ts`, which supervises core (port 4000)
and the site (internal port 4321, proxied by core) as one process tree, and
exits non-zero if either child dies.

A systemd unit:

```ini
[Unit]
Description=Wove
After=network.target

[Service]
WorkingDirectory=/opt/wove
Environment=WOVE_ENV=production
Environment=WOVE_SITE_URL=https://your-domain.example
EnvironmentFile=/opt/wove/.env
ExecStart=/home/wove/.bun/bin/bun run start
Restart=on-failure
User=wove

[Install]
WantedBy=multi-user.target
```

Keep secrets (`WOVE_SECRET`, AI keys) in `/opt/wove/.env`, not the unit file.

## Reverse proxy / TLS

A minimal Caddyfile (automatic HTTPS via Let's Encrypt):

```
your-domain.example {
  reverse_proxy 127.0.0.1:4000
}
```

Point `WOVE_SITE_URL` at the same `https://your-domain.example` so CORS and
secure cookies line up, and set `WOVE_TRUST_PROXY=1` so core trusts
`X-Forwarded-*` from Caddy.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WOVE_ENV` | `development` | set `production` to enable prod hardening (secure cookies, static admin + site proxy, CORS lockdown) |
| `PORT` | `4000` | core's HTTP port |
| `WOVE_SITE_URL` | falls back to `RENDER_EXTERNAL_URL`, then `https://$RAILWAY_PUBLIC_DOMAIN` | public URL of the site; drives CORS, secure-cookie detection, admin/invite/reset links, and canonical/OG links |
| `WOVE_PUBLIC_URL` | falls back to `WOVE_API_URL` | public origin used to build absolute media/OG URLs on the site — set this when the API's public origin differs from where the site reaches it internally |
| `WOVE_SECRET` | generated to `data/secret` | encrypts stored AI keys |
| `WOVE_ADMIN_DIST` | `packages/admin/dist` | where core serves the built admin SPA from, under `/admin` |
| `WOVE_SITE_UPSTREAM` | — | internal origin of the Astro site core reverse-proxies non-API routes to (e.g. `http://127.0.0.1:4321`) |
| `WOVE_CORS_ORIGINS` | — | comma-separated extra allowed origins, beyond dev defaults and `WOVE_SITE_URL` |
| `WOVE_SECURE_COOKIES` | implied by an `https://` `WOVE_SITE_URL` | force `1` to require `Secure` cookies |
| `WOVE_TRUST_PROXY` | `0` | set `1` when a reverse proxy sets `X-Forwarded-*` in front of core |
| `WOVE_AI_<PROVIDER>_KEY` | — | server-wide AI key (`ANTHROPIC`, `OPENAI`, `GOOGLE`, `XAI`, `OPENAI_COMPATIBLE`); a key set in the admin takes precedence |
| `WOVE_AI_RATE_LIMIT` | `30` | AI requests per minute per actor |
| `WOVE_RATE_LIMIT` | `1` (on) | set `0` to disable request rate limiting |
| `WOVE_STORAGE` | `local` | `s3` with `WOVE_S3_BUCKET/REGION/ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/PUBLIC_URL` |
| `WOVE_MAX_UPLOAD_MB` | `25` | upload cap |
| `WOVE_SCHEDULER` | `1` | set `0` to disable scheduled publishing |
| `WOVE_AUDIT_READS` | `0` | set `1` to audit successful reads too |
| `WOVE_AUDIT_RETENTION_DAYS` | `90` | days to keep audit log rows; `0` disables pruning |
| `WOVE_AI_USAGE_RETENTION_DAYS` | `365` | days to keep AI usage records |
| `WOVE_TRASH_RETENTION_DAYS` | `30` | days before trashed content is purged |
| `WOVE_EMAIL_DRIVER` | `console` | `console` (log only), `smtp`, or `resend` |
| `WOVE_EMAIL_FROM` | `Wove <no-reply@localhost>` | sender address |
| `WOVE_SMTP_URL` | — | `smtp://user:pass@host:587` (or `smtps://`) when driver is `smtp` |
| `WOVE_RESEND_KEY` | — | Resend API key when driver is `resend` |

> **Email via the dashboard:** Settings → Site → Email configures the driver, sender, and secret from the admin — the secret is stored encrypted under `WOVE_SECRET`, and dashboard config takes precedence over the env vars above.

## S3 media

Set `WOVE_STORAGE=s3` plus:

```
WOVE_S3_BUCKET=your-bucket
WOVE_S3_REGION=us-east-1
WOVE_S3_ENDPOINT=https://s3.us-east-1.amazonaws.com   # or any S3-compatible endpoint
WOVE_S3_ACCESS_KEY_ID=...
WOVE_S3_SECRET_ACCESS_KEY=...
WOVE_S3_PUBLIC_URL=https://cdn.your-domain.example
```

Media is then served straight from `WOVE_S3_PUBLIC_URL`, and `data/media`
inside the container stays empty — only the SQLite database needs the
volume.

## Updating

### Docker

```sh
docker compose pull && docker compose up -d
```

`docker-compose.yml` tracks `ghcr.io/soyzamudio/wove:latest`. To pin a version,
set the tag explicitly (`ghcr.io/soyzamudio/wove:0.1.0`) — recommended in
production, so upgrades are a deliberate edit.

**Pre-upgrade backup**: on boot, before it applies any pending Drizzle
migration, Wove copies the SQLite database to `data/backups/` (inside the
volume, next to `wove.db`). No manual step, no downtime beyond the restart.

**Rollback**: point the image back at the previous tag, then restore that
backup — schema changes are not reversed by downgrading the code alone.

```sh
# 1. back to the previous image
sed -i 's|wove:0.2.0|wove:0.1.0|' docker-compose.yml && docker compose up -d
# 2. restore the pre-upgrade backup over the live DB
docker compose stop wove
docker run --rm -v wove_wove-data:/data alpine \
  sh -c 'cp /data/backups/wove-<timestamp>.db /data/wove.db'
docker compose start wove
```

### Git install (VPS / bare metal)

```sh
bun run update            # newest tag: changelog delta, checkout, install, build
bun run update --check    # just tell me whether an update exists
sudo systemctl restart wove
```

`bun run update` refuses to run on a dirty working tree and never touches the
database — migrations (and the pre-upgrade backup above) happen on the next
boot, which is why the restart is a separate, deliberate step.

### Update notices in the admin

The admin shows a notice when a newer release exists. The check asks
`updates.usewove.com` (falling back to the GitHub releases API) for the latest
version number and **sends nothing** — no site URL, no telemetry, no
identifiers, just an outbound GET. Turn it off with:

```
WOVE_UPDATE_CHECK=0
```

### Migrations

Drizzle migrations run automatically on boot; there is no manual migration
step. Any release that ships one is at least a minor version — see
[CHANGELOG.md](../CHANGELOG.md) for the pre-1.0 versioning policy.
