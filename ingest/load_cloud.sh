#!/usr/bin/env bash
# Load everything the page needs into a ClickHouse Cloud service, through clickhousectl: the Discogs tables from a
# GitHub release, the role map, the build-time AI colours, a shelf, and the person-to-album graph.
#   CH_SERVICE=every-liner-note ./ingest/load_cloud.sh 20261101 [collection.csv]
# Without a CSV it uses the newest Discogs export the build has seen.
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP=${1:?the dump date of the data release, like 20261101}
CSV=${2:-$(ls -t data/export/*/*.csv ./*collection*.csv 2>/dev/null | head -1 || true)}
[[ -n $CSV ]] || { echo "No collection CSV. Pass one, or run ./build.sh with your export first." >&2; exit 1; }
REPO=${REPO:-tylerhannan/every-liner-note}
BASE=https://github.com/$REPO/releases/download/data-$DUMP
source ingest/ch.sh
source ingest/tables.sh
step() { echo "==> $*" >&2; }

step "Schema"
chq_file ingest/schema.sql

# Release downloads redirect to GitHub's file host, so url() has to follow redirects.
# One file per statement, since a Query API call that times out isn't retried; the row counts catch a piece that didn't land.
FOLLOW="SETTINGS max_http_get_redirects = 5"
for spec in $TABLES; do
  IFS=: read -r t _ n <<< "$spec"
  step "$t, $n file(s) from the data-$DUMP release"
  chq "TRUNCATE TABLE discogs.$t"
  for ((i = 1; i <= n; i++)); do
    chq "INSERT INTO discogs.$t SELECT * FROM url('$BASE/$t.$i.parquet', Parquet) $FOLLOW"
  done
  have=$(chq "SELECT count() FROM discogs.$t")
  want=$(chq "SELECT count() FROM url('$BASE/$t.{1..$n}.parquet', Parquet) $FOLLOW")
  [[ $have == "$want" ]] || { echo "$t has $have rows but the files have $want. Run this again." >&2; exit 1; }
done

step "Role map"
./ingest/load_role_map.sh

step "Vinyl colours from the build-time AI step"
colours="url('https://raw.githubusercontent.com/$REPO/main/data/ai/colours.tsv', TSV, 'phrase String, colour String')"
sed "s#__COLOURS__#$colours#" sql/ai/vinyl_colours.sql > data/vinyl_colours.cloud.sql
chq_file data/vinyl_colours.cloud.sql

step "Shelf from $CSV"
./ingest/load_shelf.sh "$CSV"

step "The person-to-album graph"
chq_file sql/graph.sql

step "Row counts"
chq "SELECT table, sum(rows) AS rows FROM system.parts WHERE active AND database = 'discogs' GROUP BY table ORDER BY table FORMAT PrettyCompactMonoBlock"
