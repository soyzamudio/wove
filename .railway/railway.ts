/**
 * Railway Infrastructure as Code — https://docs.railway.com/infrastructure-as-code
 *
 * This is the only Railway config that can declare the volume, which is the
 * whole ballgame for Wove: everything it writes (the SQLite database and
 * locally-stored media) lives in /app/packages/core/data, and Railway's
 * container filesystem is ephemeral. No volume, no site after the first
 * redeploy. `railway.json` in the repo root cannot express this — its schema
 * has no volume key — and repo config-as-code stops being read on 2026-12-01.
 *
 * Apply it from a clone (IaC is CLI-driven; a git push does NOT apply it):
 *
 *   npm install railway        # provides the `railway/iac` module below
 *   railway login && railway link
 *   railway config plan        # preview
 *   railway config apply       # apply after confirmation
 *
 * For a genuine one-click button, publish this as a template from your Railway
 * account — see docs/DEPLOY.md → "Publishing a Wove template on Railway".
 */
import { defineRailway, image, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  // 2 GB matches render.yaml. Resize before you fill it — media is the part
  // that grows, and moving to WOVE_STORAGE=s3 takes that half off the disk.
  const data = volume("wove-data", { sizeMB: 2048 });

  const wove = service("wove", {
    // Published on every release. Pin a version (…/wove:0.2.0) in production;
    // automatic updates are supported for GHCR, so `patch` is a safe default.
    source: image("ghcr.io/soyzamudio/wove:latest", { autoUpdates: { type: "patch" } }),
    healthcheck: "/health",
    healthcheckTimeout: 300,
    replicas: 1, // SQLite on a single volume — never scale this past 1.
    volumeMounts: {
      "/app/packages/core/data": data,
    },
    env: {
      WOVE_ENV: "production",
      // Railway terminates TLS in front of the container and sets X-Forwarded-*.
      WOVE_TRUST_PROXY: "1",
      PORT: "4000",
      // WOVE_SECRET is deliberately absent: core generates one on first boot and
      // writes it to data/secret, which is on the volume above — so it survives
      // redeploys without ever being stored in this file or in Railway's UI.
      // Set it explicitly only if you need the same secret across environments.
      //
      // WOVE_SITE_URL is likewise unset: core falls back to Railway's injected
      // RAILWAY_PUBLIC_DOMAIN (packages/core/src/env.ts → siteUrl), so CORS,
      // Secure cookies and invite/reset links are right on the generated
      // *.up.railway.app domain. Set it once you attach a custom domain.
    },
  });

  return project("wove", { resources: [wove, data] });
});
