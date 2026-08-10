#!/usr/bin/env bash
#
# dev.sh - restart the local dev servers.
#
#   ./dev.sh          stop whatever holds the dev ports, then start api + web
#   ./dev.sh stop     stop only
#
# Both servers are started detached; their output goes to logs/.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# The api and the web dev server both read PORT, so it is set per-command below
# rather than exported. API_PORT is effectively fixed: src/app/websocket.ts
# hardcodes 8086 for the dev websocket connection.
API_PORT="${API_PORT:-8086}"
WEB_PORT="${WEB_PORT:-3000}"

LOG_DIR="$ROOT/logs"
API_LOG="$LOG_DIR/dev-api.log"
WEB_LOG="$LOG_DIR/dev-web.log"

pids_on_port() {
  lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true
}

# The process holding a port is the leaf of an npm -> sh -> nodemon -> ts-node
# chain. Killing only the leaf lets nodemon respawn it, so walk up and collect
# the launchers too, stopping as soon as a parent is no longer part of the
# chain (the shell that started it, or launchd).
chain_for() {
  local pid="$1" ppid cmd
  while [ -n "$pid" ] && [ "$pid" -gt 1 ]; do
    printf '%s\n' "$pid"
    # A pid can exit between lsof and here (nodemon restarting its child),
    # so never let a missing process abort the run.
    ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
    if [ -z "$ppid" ] || [ "$ppid" -le 1 ]; then
      break
    fi
    cmd="$(ps -o command= -p "$ppid" 2>/dev/null || true)"
    case "$cmd" in
      *nodemon*|*react-scripts*|*ts-node*|*npm-cli.js*) pid="$ppid" ;;
      *) break ;;
    esac
  done
}

stop_port() {
  local label="$1" port="$2"
  local pid targets waited leftover

  targets=""
  for pid in $(pids_on_port "$port"); do
    targets="$targets $(chain_for "$pid" | tr '\n' ' ')"
  done
  targets="$(for pid in $targets; do echo "$pid"; done | sort -un | xargs)"

  if [ -z "$targets" ]; then
    echo "  $label (:$port) - nothing listening"
    return 0
  fi

  echo "  $label (:$port) - stopping:"
  ps -o pid=,command= -p "$(echo "$targets" | tr ' ' ',')" 2>/dev/null | cut -c1-140 | sed 's/^/    /' || true
  kill $targets 2>/dev/null || true

  waited=0
  while [ -n "$(pids_on_port "$port")" ] && [ "$waited" -lt 10 ]; do
    sleep 1
    waited=$((waited + 1))
  done

  leftover="$(pids_on_port "$port" | xargs)"
  if [ -n "$leftover" ]; then
    echo "    :$port still held after ${waited}s, sending SIGKILL to $leftover"
    kill -9 $leftover 2>/dev/null || true
    sleep 1
  fi
}

wait_http() {
  local label="$1" url="$2" timeout="$3" log="$4"
  local waited=0 code

  while [ "$waited" -lt "$timeout" ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  echo "error: $label did not answer $url within ${timeout}s. Last 30 lines of $log:" >&2
  tail -30 "$log" >&2
  return 1
}

stop_all() {
  echo "stopping dev servers..."
  stop_port "api" "$API_PORT"
  stop_port "web" "$WEB_PORT"
}

start_all() {
  local blocked=""

  # react-scripts prompts on stdin when its port is taken; detached with stdin
  # closed that hangs silently, so refuse to start instead of guessing.
  if [ -n "$(pids_on_port "$API_PORT")" ]; then blocked="$blocked :$API_PORT"; fi
  if [ -n "$(pids_on_port "$WEB_PORT")" ]; then blocked="$blocked :$WEB_PORT"; fi
  if [ -n "$blocked" ]; then
    echo "error: port(s)$blocked still in use, refusing to start" >&2
    exit 1
  fi

  mkdir -p "$LOG_DIR"

  # api first: it is the proxy target for the web dev server.
  echo "starting api (:$API_PORT)..."
  PORT="$API_PORT" nohup npm run watch-server </dev/null >"$API_LOG" 2>&1 &
  wait_http "api" "http://localhost:$API_PORT/root" 30 "$API_LOG"

  echo "starting web (:$WEB_PORT)..."
  PORT="$WEB_PORT" BROWSER=none nohup npm run start:web </dev/null >"$WEB_LOG" 2>&1 &
  wait_http "web" "http://localhost:$WEB_PORT/" 120 "$WEB_LOG"

  echo
  echo "  api  http://localhost:$API_PORT  pid $(pids_on_port "$API_PORT" | xargs)  log $API_LOG"
  echo "  web  http://localhost:$WEB_PORT  pid $(pids_on_port "$WEB_PORT" | xargs)  log $WEB_LOG"
}

case "${1:-restart}" in
  restart|start)
    stop_all
    start_all
    ;;
  stop)
    stop_all
    ;;
  *)
    echo "usage: $(basename "$0") [restart|stop]" >&2
    exit 2
    ;;
esac
