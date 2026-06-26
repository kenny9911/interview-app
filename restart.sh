#!/usr/bin/env bash
# viva dev control — stop / start / restart the local backend stack.
#
# The "backend stack" = the Fastify API (port 4000) + the LiveKit voice-agent
# worker, i.e. exactly what ./dev.sh launches. This script is the safe way to
# recover from a stuck stack (orphaned watchers, a port wedged on :4000, a
# half-dead agent) without hunting for PIDs.
#
# Usage:
#   ./restart.sh                 stop the stack, then start it (foreground)
#   ./restart.sh start           start the stack (= ./dev.sh)
#   ./restart.sh stop            stop the stack and exit
#   ./restart.sh restart         explicit restart (same as no argument)
#   ./restart.sh status          show what's running (read-only)
#
# Flags:
#   -m | --metro                 also free the Expo Metro bundler (:8081)
#   -n | --dry-run               print what would be stopped; kill nothing
#
# Notes:
#  - Every kill is scoped to THIS repo's path, so your other projects'
#    node/tsx processes (e.g. RoboHire) are never touched.
#  - The Metro bundler and the iOS Simulator / Android emulator are interactive
#    and live in their own terminal — see DEVELOPMENT.md for those. `status`
#    reports them; `--metro` only frees the :8081 port so you can restart
#    `npx expo start` cleanly.
#
# Written for macOS's default bash 3.2 — no arrays, no `wait -n`.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

API_PORT=4000
METRO_PORT=8081
DRY_RUN=0
WITH_METRO=0

say()  { echo "[viva] $*"; }

# --- helpers ---------------------------------------------------------------

# pids whose full command line contains <pattern>, excluding this script.
pids_matching() { # pids_matching <pattern>
  pgrep -f "$1" 2>/dev/null | grep -v "^$$\$" || true
}

show_procs() { # show_procs <pattern>  — human-readable lines for dry-run/status
  pgrep -fl "$1" 2>/dev/null | grep -v "restart.sh" || true
}

kill_scoped() { # kill_scoped <pattern> <label>
  local pat="$1" label="$2" pids
  pids="$(pids_matching "$pat")"
  if [ -z "$pids" ]; then
    say "$label: not running"
    return
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say "(dry-run) would stop $label:"
    show_procs "$pat" | sed 's/^/         /'
    return
  fi
  say "stopping $label (pids: $(echo $pids | tr '\n' ' '))"
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(pids_matching "$pat")"
  if [ -n "$pids" ]; then
    say "force-killing $label (pids: $(echo $pids | tr '\n' ' '))"
    kill -9 $pids 2>/dev/null || true
  fi
}

free_port() { # free_port <port> <label>
  local port="$1" label="$2" pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    say "$label (:$port): free"
    return
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say "(dry-run) would free $label on :$port (pids: $(echo $pids | tr '\n' ' '))"
    return
  fi
  say "freeing $label on :$port (pids: $(echo $pids | tr '\n' ' '))"
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pids" ] && { say "force-killing :$port"; kill -9 $pids 2>/dev/null || true; }
}

# Only free :8081 if the listener actually belongs to this repo's mobile app —
# never stomp on some other project's Metro.
free_metro() {
  local pids p cmd ours=""
  pids="$(lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then say "Metro (:$METRO_PORT): free"; return; fi
  for p in $pids; do
    cmd="$(ps -o command= -p "$p" 2>/dev/null || true)"
    case "$cmd" in
      *"$ROOT/mobile"*|*expo*|*metro*) ours="$ours $p" ;;
    esac
  done
  if [ -z "$ours" ]; then
    say "Metro (:$METRO_PORT): in use by another project — leaving it alone"
    return
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say "(dry-run) would free Metro on :$METRO_PORT (pids:$ours )"; return
  fi
  say "freeing Metro on :$METRO_PORT (pids:$ours )"
  kill $ours 2>/dev/null || true
  sleep 1
}

# --- actions ---------------------------------------------------------------

stop_stack() {
  # Backend API: free the port AND clear any orphaned tsx watcher for server.ts.
  free_port "$API_PORT" "backend API"
  kill_scoped "$ROOT/server.*src/server\.ts" "backend API watcher"
  # Voice agent worker has no port — match its tsx process under this repo.
  kill_scoped "$ROOT/agent" "voice agent worker"
  # Killing dev.sh's children makes a running dev.sh self-exit; give it a moment.
  [ "$DRY_RUN" = 1 ] || sleep 1
  [ "$WITH_METRO" = 1 ] && free_metro
  say "stack stopped."
}

start_stack() {
  say "starting backend stack via ./dev.sh …"
  exec "$ROOT/dev.sh"
}

status() {
  echo "── viva dev status ───────────────────────────────────────────"
  # Backend API
  if lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    if curl -s -m 2 "http://localhost:$API_PORT/v1/healthz" | grep -q '"ok":true'; then
      echo "backend API   : UP   (http://localhost:$API_PORT, /v1/healthz ok)"
    else
      echo "backend API   : :$API_PORT in use but /v1/healthz not ok"
    fi
  else
    echo "backend API   : down (nothing on :$API_PORT)"
  fi
  # Orphaned server watcher (port down but watcher alive)
  local sw; sw="$(pids_matching "$ROOT/server.*src/server\.ts")"
  [ -n "$sw" ] && echo "  └ server tsx watcher running (pids: $(echo $sw | tr '\n' ' '))"
  # Agent
  local ag; ag="$(pids_matching "$ROOT/agent")"
  if [ -n "$ag" ]; then echo "voice agent   : running (pids: $(echo $ag | tr '\n' ' '))"
  else echo "voice agent   : down"; fi
  # Metro
  if lsof -nP -iTCP:"$METRO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Metro bundler : UP   (:$METRO_PORT)"
  else echo "Metro bundler : down (:$METRO_PORT)"; fi
  # iOS simulators
  if command -v xcrun >/dev/null 2>&1; then
    local booted; booted="$(xcrun simctl list devices booted 2>/dev/null | grep -E 'Booted' || true)"
    if [ -n "$booted" ]; then echo "iOS simulator : booted →"; echo "$booted" | sed 's/^/                /'
    else echo "iOS simulator : none booted"; fi
  fi
  # Android devices
  if command -v adb >/dev/null 2>&1; then
    local dev; dev="$(adb devices 2>/dev/null | grep -wE 'device|emulator' | grep -v 'List of' || true)"
    if [ -n "$dev" ]; then echo "Android device: connected →"; echo "$dev" | sed 's/^/                /'
    else echo "Android device: none connected"; fi
  fi
  echo "──────────────────────────────────────────────────────────────"
}

# --- arg parse -------------------------------------------------------------

CMD="restart"
for a in "$@"; do
  case "$a" in
    start|stop|restart|status) CMD="$a" ;;
    -m|--metro)   WITH_METRO=1 ;;
    -n|--dry-run) DRY_RUN=1 ;;
    -h|--help)    awk 'NR>1 && /^#/{sub(/^# ?/,""); print; next} NR>1{exit}' "$0"; exit 0 ;;
    *) echo "unknown argument: $a (try --help)" >&2; exit 2 ;;
  esac
done

case "$CMD" in
  status)  status ;;
  stop)    stop_stack ;;
  start)   start_stack ;;
  restart) stop_stack; [ "$DRY_RUN" = 1 ] && { say "(dry-run) would then run ./dev.sh"; exit 0; }; start_stack ;;
esac
