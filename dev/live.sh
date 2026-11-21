#!/usr/bin/env bash
# Serve the local data so the page's "Run live" has something to talk to. Ctrl-C stops it.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/server
cat <<'EOF'
Local ClickHouse for live mode, on this machine only.

  1. Open web/index.html
  2. Press "Run live" (top right) and enter:
       HTTP endpoint  http://localhost:8123
       User           web
       Password       vinyl-local
  3. Every SQL bar now has a "Run live" button, and its SQL is editable.

Stop this (Ctrl-C) before running ./build.sh again.
EOF
exec clickhouse server --config-file=dev/server.xml
