#!/usr/bin/env bash
# Load sql/role_map.csv (role -> category -> link strength) into discogs.role_map.
#   CH_LOCAL=1 ./ingest/load_role_map.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CSV=$HERE/../sql/role_map.csv
source "$HERE/ch.sh"

if grep -q '\$\$' "$CSV"; then echo "role_map.csv contains \$\$, can't inline it" >&2; exit 1; fi

chq "CREATE TABLE IF NOT EXISTS discogs.role_map (role String, category LowCardinality(String), link Enum8('none' = 0, 'weak' = 1, 'strong' = 2)) ENGINE = MergeTree ORDER BY role"
chq "TRUNCATE TABLE discogs.role_map"
chq "INSERT INTO discogs.role_map SELECT * FROM format(CSVWithNames, 'role String, category String, link String', \$\$$(cat "$CSV")\$\$)"
