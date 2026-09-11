#!/usr/bin/env bash
# One-click start for the whole demo: sys1 + both web consoles.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh

echo "Sentinel Zero — starting everything"
echo

ensure_sys1_venv
launch "sys1 API" 8000 "sys1.log" "$ROOT_DIR/sys1" \
  ./venv/bin/uvicorn app.main:app --port 8000

ensure_console_deps "$ROOT_DIR/console-admin"
launch "admin backend" 3001 "console-admin-api.log" "$ROOT_DIR/console-admin" \
  ./node_modules/.bin/tsx server/index.ts
launch "admin frontend" 3000 "console-admin-web.log" "$ROOT_DIR/console-admin" \
  ./node_modules/.bin/vite --host --port 3000

ensure_console_deps "$ROOT_DIR/console-worker"
launch "worker backend" 3011 "console-worker-api.log" "$ROOT_DIR/console-worker" \
  ./node_modules/.bin/tsx server/index.ts
launch "worker frontend" 3010 "console-worker-web.log" "$ROOT_DIR/console-worker" \
  ./node_modules/.bin/vite --host --port 3010

echo
echo "waiting for everything to come up..."
wait_for_port 8000 "sys1 API              — http://127.0.0.1:8000/docs"
wait_for_port 3001 "admin backend"
wait_for_port 3000 "admin console         — http://127.0.0.1:3000"
wait_for_port 3011 "worker backend"
wait_for_port 3010 "worker console        — http://127.0.0.1:3010"

echo
echo "All up. Logs in .sentinel-logs/, PIDs tracked in .sentinel-pids."
echo "Run scripts/stop-all.sh to shut everything down."
