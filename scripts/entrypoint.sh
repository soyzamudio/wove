#!/bin/sh
# Container entrypoint. PaaS volumes (Railway, Render, plain Docker) are mounted
# owned by root, but the app runs as the non-root `wove` user — so when we start
# as root, fix the data dir's ownership, then drop privileges immediately.
# If the platform already runs us as non-root (or as `wove`), just exec.
set -e
DATA_DIR="/app/packages/core/data"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R wove:wove "$DATA_DIR"
  # util-linux's setpriv ships in debian slim; gosu as fallback; else warn and run as root.
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid wove --regid wove --init-groups "$@"
  elif command -v gosu >/dev/null 2>&1; then
    exec gosu wove "$@"
  else
    echo "[entrypoint] warning: setpriv/gosu not found — running as root" >&2
    exec "$@"
  fi
fi
exec "$@"
