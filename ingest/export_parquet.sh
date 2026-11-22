#!/usr/bin/env bash
# Export the Discogs tables the page reads to Parquet, in pieces under GitHub's 2 GiB limit for release files,
# so ClickHouse Cloud (or anyone) can load them with url(). works and edges aren't exported; sql/graph.sql rebuilds them.
#   ./ingest/export_parquet.sh 20261101     # writes data/release/20261101/
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP=${1:?the dump date, like 20261101}
OUT=data/release/$DUMP
mkdir -p "$OUT"

source ingest/tables.sh
q() { clickhouse local --path data/chlocal --query "$1" < /dev/null; }
PARQUET="FORMAT Parquet SETTINGS output_format_parquet_compression_method = 'zstd'"

# table, split key, pieces
export_table() {
  local t=$1 key=$2 n=$3
  if [[ $n == 1 ]]; then
    q "SELECT * FROM discogs.$t INTO OUTFILE '$OUT/$t.1.parquet' TRUNCATE $PARQUET"
  else
    # Cut at quantiles of the key so the pieces come out about the same size
    local levels bounds
    levels=$(awk -v n="$n" 'BEGIN { for (i = 1; i < n; i++) printf "%s%.6f", (i > 1 ? ", " : ""), i / n }')
    bounds=(0 $(q "SELECT arrayStringConcat(arrayMap(x -> toString(toUInt64(x)), quantiles($levels)($key)), ' ') FROM discogs.$t") 4294967296)
    for ((i = 1; i <= n; i++)); do
      q "SELECT * FROM discogs.$t WHERE $key >= ${bounds[i-1]} AND $key < ${bounds[i]} INTO OUTFILE '$OUT/$t.$i.parquet' TRUNCATE $PARQUET"
    done
  fi
  echo "$t: $n piece(s)" >&2
}

for spec in $TABLES; do
  IFS=: read -r t key n <<< "$spec"
  export_table "$t" "$key" "$n"
done

# Rows in the files should match the tables, and no file may reach GitHub's limit
for spec in $TABLES; do
  t=${spec%%:*}
  have=$(q "SELECT count() FROM file('$OUT/$t.*.parquet', Parquet)")
  want=$(q "SELECT count() FROM discogs.$t")
  [[ $have == "$want" ]] || { echo "$t: $have rows in the files, $want in the table" >&2; exit 1; }
done
big=$(find "$OUT" -name '*.parquet' -size +1900M)
[[ -z $big ]] || { echo "Over 1.9 GB, split these further: $big" >&2; exit 1; }
ls -l "$OUT" | awk 'NR > 1 { printf "%8.0f MB  %s\n", $5 / 1e6, $9 }'
