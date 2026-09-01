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
| `WOVE_SITE_URL` | — | public URL of the site; drives CORS, secure-cookie detection, and canonical/OG links |
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

```sh
docker compose pull && docker compose up -d --build   # Docker
# or, on a VPS:
git pull && bun install && bun run build && sudo systemctl restart wove
```

Drizzle migrations run automatically on boot; no manual migration step.
