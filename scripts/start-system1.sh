#!/usr/bin/env bash
# One-click start for System 1: the core engine (sys1) + the admin console
# (approvals & monitoring) — everything on Aarush's side.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec ./start-console-admin.sh
