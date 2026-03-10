#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PORT="${PORT:-3000}"
DEV_LOG="$RUNTIME_DIR/dev.log"
TUNNEL_LOG="$RUNTIME_DIR/tunnel.log"
DEV_PID_FILE="$RUNTIME_DIR/dev.pid"
TUNNEL_PID_FILE="$RUNTIME_DIR/tunnel.pid"
URL_FILE="$RUNTIME_DIR/share-url.txt"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-$ROOT_DIR/.runtime/cloudflared}"
CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"

mkdir -p "$RUNTIME_DIR"

pid_is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' < "$file"
  fi
}

stop_pid_file() {
  local file="$1"
  local pid
  pid="$(read_pid "$file")"
  if pid_is_running "$pid"; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if pid_is_running "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$file"
}

kill_matching_processes() {
  local pattern="$1"
  mapfile -t pids < <(ps -eo pid=,args= | grep -F "$pattern" | grep -v "grep -F" | awk '{print $1}')
  if [[ "${#pids[@]}" -eq 0 ]]; then
    return
  fi

  kill "${pids[@]}" 2>/dev/null || true
  sleep 1

  mapfile -t still_running < <(ps -eo pid=,args= | grep -F "$pattern" | grep -v "grep -F" | awk '{print $1}')
  if [[ "${#still_running[@]}" -gt 0 ]]; then
    kill -9 "${still_running[@]}" 2>/dev/null || true
  fi
}

next_dev_running() {
  pgrep -f "node_modules/next/dist/bin/next dev" >/dev/null 2>&1
}

cloudflared_running() {
  pgrep -f "cloudflared tunnel .*http://127.0.0.1:$PORT" >/dev/null 2>&1
}

ensure_cloudflared() {
  if [[ -x "$CLOUDFLARED_BIN" ]]; then
    return
  fi

  echo "Downloading cloudflared..."
  curl -L --fail --output "$CLOUDFLARED_BIN.tmp" "$CLOUDFLARED_URL"
  chmod +x "$CLOUDFLARED_BIN.tmp"
  mv "$CLOUDFLARED_BIN.tmp" "$CLOUDFLARED_BIN"
}

start_dev_server() {
  : > "$DEV_LOG"
  setsid node "$ROOT_DIR/node_modules/next/dist/bin/next" dev -H 0.0.0.0 -p "$PORT" >>"$DEV_LOG" 2>&1 < /dev/null &
  echo "$!" > "$DEV_PID_FILE"
}

wait_for_dev_server() {
  local attempts=90
  for ((i = 1; i <= attempts; i += 1)); do
    if curl -sS "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  echo "Dev server did not become ready. Check $DEV_LOG" >&2
  exit 1
}

start_tunnel() {
  : > "$TUNNEL_LOG"
  setsid "$CLOUDFLARED_BIN" tunnel --protocol http2 --url "http://127.0.0.1:$PORT" >>"$TUNNEL_LOG" 2>&1 < /dev/null &
  echo "$!" > "$TUNNEL_PID_FILE"
}

wait_for_tunnel_url() {
  local attempts=45
  for ((i = 1; i <= attempts; i += 1)); do
    local url
    url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -n 1 || true)"
    if [[ -n "$url" ]]; then
      printf '%s\n' "$url" > "$URL_FILE"
      return
    fi
    sleep 1
  done

  echo "Tunnel URL was not created. Check $TUNNEL_LOG" >&2
  exit 1
}

command="${1:-up}"

case "$command" in
  up)
    if pid_is_running "$(read_pid "$DEV_PID_FILE")" && pid_is_running "$(read_pid "$TUNNEL_PID_FILE")" && [[ -f "$URL_FILE" ]]; then
      echo "Shared dev server already running:"
      cat "$URL_FILE"
      exit 0
    fi

    ensure_cloudflared
    start_dev_server
    wait_for_dev_server
    start_tunnel
    wait_for_tunnel_url
    echo "Shared dev server is running:"
    cat "$URL_FILE"
    ;;
  restart)
    kill_matching_processes "node_modules/next/dist/bin/next dev"
    kill_matching_processes "cloudflared tunnel"
    stop_pid_file "$TUNNEL_PID_FILE"
    stop_pid_file "$DEV_PID_FILE"
    rm -f "$URL_FILE"
    ensure_cloudflared
    start_dev_server
    wait_for_dev_server
    start_tunnel
    wait_for_tunnel_url
    echo "Shared dev server restarted:"
    cat "$URL_FILE"
    ;;
  stop)
    kill_matching_processes "node_modules/next/dist/bin/next dev"
    kill_matching_processes "cloudflared tunnel"
    stop_pid_file "$TUNNEL_PID_FILE"
    stop_pid_file "$DEV_PID_FILE"
    rm -f "$URL_FILE"
    echo "Shared dev server stopped."
    ;;
  status)
    if pid_is_running "$(read_pid "$DEV_PID_FILE")" || next_dev_running; then
      echo "Dev server: running"
    else
      echo "Dev server: stopped"
    fi

    if pid_is_running "$(read_pid "$TUNNEL_PID_FILE")" || cloudflared_running; then
      echo "Tunnel: running"
    else
      echo "Tunnel: stopped"
    fi

    if [[ -f "$URL_FILE" ]]; then
      echo "URL:"
      cat "$URL_FILE"
    fi
    ;;
  *)
    echo "Usage: $0 {up|restart|stop|status}" >&2
    exit 1
    ;;
esac
