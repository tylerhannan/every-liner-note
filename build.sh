#!/usr/bin/env bash
# Build everything the page needs, in order.
#   ./build.sh                    rebuild the page from data already loaded
#   ./build.sh --dump 20261101    first download and load that month's Discogs dump
#   ./build.sh --ai               also rerun the AI step (needs Ollama with gemma3:4b)
set -euo pipefail
cd "$(dirname "$0")"

DUMP="" AI=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --dump) DUMP=${2:?--dump needs a date like 20261101}; shift 2 ;;
    --ai) AI=--ai; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# clickhouse-local and the live-mode server can't share the data directory
if pgrep -f "clickhouse server --config-file=dev/server.xml" >/dev/null; then
  echo "The local live server is running. Stop it (Ctrl-C in its terminal) and run this again." >&2
  exit 1
fi

export CH_LOCAL=1
step() { echo "==> $*" >&2; }

if [[ -n $DUMP ]]; then
  step "Loading the $DUMP Discogs dump (download, convert, load)"
  DUMP=$DUMP ./ingest/load.sh
elif [[ ! -d data/chlocal/store ]]; then
  echo "No Discogs data loaded yet. Run: ./build.sh --dump 20261101" >&2
  exit 1
fi

step "Role map and the person-to-album graph"
./ingest/load_role_map.sh
source ingest/ch.sh
chq_file sql/graph.sql

# The newest Discogs export in the repo root. Bigger collections come as a zip, which gets unpacked into its own folder.
export_file=$(ls -t ./*collection*.csv ./*collection*.zip 2>/dev/null | head -1 || true)
csv=$export_file
if [[ $export_file == *.zip ]]; then
  dir=data/export/$(basename "$export_file" .zip)
  rm -rf "$dir" && mkdir -p "$dir"
  unzip -q -o -j "$export_file" '*.csv' -d "$dir"
  csv=$(ls "$dir"/*.csv | head -1)
fi
if [[ -n $csv ]]; then
  step "Shelf from $csv"
  ./ingest/load_shelf.sh "$csv"
else
  echo "No Discogs collection export (*collection*.csv or .zip) in the repo root; keeping the shelf already loaded." >&2
fi

step "Page data"
python3 -I web/build.py $AI
step "Done. Open web/index.html"
