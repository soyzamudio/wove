# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps: install the full workspace (dev + prod deps) with a frozen lockfile,
# cached separately from source so `bun install` only reruns when
# package.json/bun.lock change.
# ---------------------------------------------------------------------------
FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/admin/package.json packages/admin/package.json
COPY packages/site/package.json packages/site/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/blocks/package.json packages/blocks/package.json
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: compile the admin SPA (Vite, served under /admin) and the site
# (Astro, server output via the node adapter). Core itself needs no build
# step — Bun runs its TypeScript source directly at runtime.
# ---------------------------------------------------------------------------
FROM oven/bun:1.2 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ---------------------------------------------------------------------------
# runtime: only what's needed to run `scripts/start.ts` — node_modules, the
# workspace package sources (core/sdk/blocks run as TS directly under Bun),
# core's DB migrations, and the two build outputs.
# ---------------------------------------------------------------------------
FROM oven/bun:1.2-slim AS runtime
WORKDIR /app

RUN groupadd --system --gid 1001 wove \
  && useradd --system --uid 1001 --gid wove --home-dir /app --shell /usr/sbin/nologin wove

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY scripts ./scripts
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/sdk/src packages/sdk/src
COPY packages/blocks/package.json packages/blocks/package.json
COPY packages/blocks/src packages/blocks/src
COPY packages/core/package.json packages/core/package.json
COPY packages/core/src packages/core/src
COPY packages/core/bin packages/core/bin
COPY packages/core/drizzle packages/core/drizzle
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY --from=build /app/packages/admin/dist packages/admin/dist
COPY --from=build /app/packages/site/dist packages/site/dist

RUN mkdir -p /app/packages/core/data && chown -R wove:wove /app

VOLUME /app/packages/core/data
EXPOSE 4000
USER wove

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "scripts/start.ts"]
