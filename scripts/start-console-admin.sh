#!/usr/bin/env bash
# Starts the admin console (approvals & monitoring) alone.
# Needs sys1 running — starts it too unless already up.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh

echo "Sentinel Zero — console-admin (approvals & monitoring)"
ensure_sys1_venv
launch "sys1 API" 8000 "sys1.log" "$ROOT_DIR/sys1" \
  ./venv/bin/uvicorn app.main:app --port 8000

ensure_console_deps "$ROOT_DIR/console-admin"
launch "admin backend" 3001 "console-admin-api.log" "$ROOT_DIR/console-admin" \
  ./node_modules/.bin/tsx server/index.ts
launch "admin frontend" 3000 "console-admin-web.log" "$ROOT_DIR/console-admin" \
  ./node_modules/.bin/vite --host --port 3000

wait_for_port 8000 "sys1 API"
wait_for_port 3001 "admin backend"
wait_for_port 3000 "admin console — http://127.0.0.1:3000"
