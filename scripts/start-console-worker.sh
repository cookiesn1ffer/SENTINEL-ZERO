#!/usr/bin/env bash
# Starts the worker console (device/agent + attack lab) alone.
# Needs sys1 running — starts it too unless already up.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh

echo "Sentinel Zero — console-worker (device / attack lab)"
ensure_sys1_venv
launch "sys1 API" 8000 "sys1.log" "$ROOT_DIR/sys1" \
  ./venv/bin/uvicorn app.main:app --port 8000

ensure_console_deps "$ROOT_DIR/console-worker"
launch "worker backend" 3011 "console-worker-api.log" "$ROOT_DIR/console-worker" \
  ./node_modules/.bin/tsx server/index.ts
launch "worker frontend" 3010 "console-worker-web.log" "$ROOT_DIR/console-worker" \
  ./node_modules/.bin/vite --host --port 3010

wait_for_port 8000 "sys1 API"
wait_for_port 3011 "worker backend"
wait_for_port 3010 "worker console — http://127.0.0.1:3010"
