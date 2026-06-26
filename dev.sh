#!/usr/bin/env bash
# Launch the viva backend API + voice agent worker together for local dev.
# The mobile app (Expo) is started separately per target:
#   cd mobile && npx expo run:ios            # iOS Simulator
#   cd mobile && npx expo run:ios --device   # real iPhone
#
# Usage:  ./dev.sh        (Ctrl-C stops everything this script started)
# Note: written for macOS's default bash 3.2 — no arrays / `wait -n`.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pids=""   # space-separated child PIDs (string, not array → bash 3.2 safe)

cleanup() {
  echo
  echo "[dev] shutting down…"
  [ -n "$pids" ] && kill $pids 2>/dev/null
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

start() { # start <label> <dir>
  echo "[dev] starting $1"
  ( cd "$ROOT/$2" && npm run dev ) &
  pids="$pids $!"
}

# Reuse an API already serving on :4000 (e.g. one you started earlier) instead
# of failing; only error if some OTHER process holds the port.
if lsof -iTCP:4000 -sTCP:LISTEN -n >/dev/null 2>&1; then
  if curl -s -m 2 http://localhost:4000/v1/healthz | grep -q '"ok":true'; then
    echo "[dev] reusing the viva API already running on http://localhost:4000"
  else
    echo "[dev] ERROR: port 4000 is in use by something that isn't the viva API." >&2
    echo "[dev] free it (e.g. kill the process on :4000) and re-run ./dev.sh" >&2
    exit 1
  fi
else
  start "backend API (server) → http://localhost:4000" server
fi

start "voice agent worker" agent

echo "[dev] running. Ctrl-C to stop."
echo "[dev] next: cd mobile && npx expo run:ios   (add --device for a real iPhone)"

# Poll the children; if any exits, tear the rest down (bash 3.2 has no `wait -n`).
while :; do
  for pid in $pids; do
    kill -0 "$pid" 2>/dev/null || { echo "[dev] a process exited — stopping the rest."; exit 1; }
  done
  sleep 1
done
