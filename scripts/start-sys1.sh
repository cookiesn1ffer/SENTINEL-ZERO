#!/usr/bin/env bash
# Starts the Sentinel Zero core engine / PEP (sys1) alone.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh

echo "Sentinel Zero — sys1 (core engine)"
ensure_sys1_venv
launch "sys1 API" 8000 "sys1.log" "$ROOT_DIR/sys1" \
  ./venv/bin/uvicorn app.main:app --port 8000
wait_for_port 8000 "sys1 API — http://127.0.0.1:8000/docs"
