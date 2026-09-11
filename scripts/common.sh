#!/usr/bin/env bash
# Shared helpers for the start-*.sh scripts. Not meant to be run directly.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.sentinel-pids"
LOG_DIR="$ROOT_DIR/.sentinel-logs"
mkdir -p "$LOG_DIR"

port_in_use() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3>&-; return 0; } || return 1
}

# Launch a background command, record its PID, and print a status line.
# usage: launch <label> <port> <logfile> <cwd> <cmd...>
launch() {
  local label="$1" port="$2" logfile="$3" cwd="$4"
  shift 4
  if port_in_use "$port"; then
    echo "  already running -> $label (port $port)"
    return 0
  fi
  # `exec` inside the subshell replaces its process image with nohup (which
  # in turn execs the target) instead of forking a child — otherwise $!
  # below would capture the subshell's PID, not the actual server's PID,
  # and stop-all.sh would kill the wrong (parent) process.
  ( cd "$cwd" && exec nohup "$@" > "$LOG_DIR/$logfile" 2>&1 ) &
  echo $! >> "$PID_FILE"
  echo "  starting        -> $label (port $port, log: .sentinel-logs/$logfile)"
}

wait_for_port() {
  local port="$1" label="$2" tries="${3:-30}"
  for _ in $(seq 1 "$tries"); do
    if port_in_use "$port"; then
      echo "  up              -> $label (http://127.0.0.1:$port)"
      return 0
    fi
    sleep 0.5
  done
  echo "  WARNING: $label did not come up on port $port — check .sentinel-logs/"
  return 1
}

ensure_sys1_venv() {
  if [ ! -x "$ROOT_DIR/sys1/venv/bin/uvicorn" ]; then
    echo "  setting up sys1 venv (first run only)..."
    python3 -m venv "$ROOT_DIR/sys1/venv"
    "$ROOT_DIR/sys1/venv/bin/pip" install -q -r "$ROOT_DIR/sys1/requirements.txt"
  fi
}

ensure_console_deps() {
  local dir="$1"
  if [ ! -d "$dir/node_modules" ]; then
    echo "  installing deps for $(basename "$dir") (first run only)..."
    ( cd "$dir" && pnpm install --silent )
  fi
}
