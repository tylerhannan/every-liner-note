#!/usr/bin/env bash
# Download a monthly dump, convert it to Parquet with discogskit, and load it into MergeTree tables.
#   CH_LOCAL=1 DUMP=20261101 ./ingest/load.sh
# Local only for now; Cloud will read the same Parquet from a bucket with s3() instead of file().
set -euo pipefail

DUMP=${DUMP:?set DUMP, e.g. 20261101}
YEAR=${DUMP:0:4}
HERE=$(cd "$(dirname "$0")" && pwd)
DATA=${DATA:-$(cd "$HERE/.." && pwd)/data}
PQ=$DATA/pq/$DUMP
source "$HERE/ch.sh"
mkdir -p "$DATA" "$PQ"

for kind in labels artists masters releases; do
  src=$DATA/discogs_${DUMP}_${kind}.xml.gz
  if [[ ! -f $src ]]; then
    # No range support on data.discogs.com, so download to a temp name and only keep it once it's whole
    curl -fL -o "$src.part" "https://data.discogs.com/?download=data%2F${YEAR}%2Fdiscogs_${DUMP}_${kind}.xml.gz"
    gzip -t "$src.part" && mv "$src.part" "$src"
  fi
  if [[ ! -f $PQ/$kind/$kind.parquet ]]; then
    discogskit convert "$src" --output "$PQ"
  fi
done

chq_file "$HERE/schema.sql"
for table in labels artists artist_links masters releases credits release_labels release_identifiers release_tracks release_formats; do
  chq "TRUNCATE TABLE discogs.$table"
done

sed "s|__DIR__|$PQ|g" "$HERE/transform.sql" > "$PQ/transform.sql"
time chq_file "$PQ/transform.sql"

chq "SELECT table, sum(rows) AS rows, formatReadableSize(sum(data_compressed_bytes)) AS size
     FROM system.parts WHERE database = 'discogs' AND active GROUP BY table ORDER BY table FORMAT PrettyCompact"
