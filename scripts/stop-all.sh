#!/usr/bin/env bash
# Stops everything started by any start-*.sh script. Kills by port rather
# than by tracked PID — some of these tools (tsx in particular) fork an
# internal child, so the PID captured at launch time isn't always the one
# actually holding the port.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT_DIR="$(cd .. && pwd)"

PORTS=(8000 3000 3001 3010 3011)
LABELS=("sys1 API" "admin frontend" "admin backend" "worker frontend" "worker backend")

count=0
for i in "${!PORTS[@]}"; do
  port="${PORTS[$i]}"
  label="${LABELS[$i]}"
  pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "${pid:-}" ]; then
    kill -9 "$pid" 2>/dev/null && { echo "  stopped -> $label (port $port, pid $pid)"; count=$((count + 1)); }
  fi
done

rm -f "$ROOT_DIR/.sentinel-pids"

if [ "$count" -eq 0 ]; then
  echo "nothing was running on the tracked ports"
else
  echo "stopped $count process(es)"
fi
