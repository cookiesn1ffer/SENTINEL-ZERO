#!/usr/bin/env bash
# One-click start for System 2: the worker console (device / attack lab) —
# everything on Sourabh's side. Also brings up sys1 since it's the
# dependency both systems talk to.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec ./start-console-worker.sh
