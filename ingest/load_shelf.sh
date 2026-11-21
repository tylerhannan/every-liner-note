#!/usr/bin/env bash
# Load a Discogs collection export into discogs.shelf.
#   CH_SERVICE=vinyl ./ingest/load_shelf.sh yourname-collection-*.csv
set -euo pipefail
CSV=${1:?path to the collection CSV}
source "$(dirname "$0")/ch.sh"

# A few hundred rows fit inside the statement, so the CSV rides along as a $$ string (minus Discogs' CRLFs)
if grep -q '\$\$' "$CSV"; then echo "CSV contains \$\$, can't inline it" >&2; exit 1; fi

# Re-exports are the whole collection each time, so replace rather than append
chq "TRUNCATE TABLE discogs.shelf"
chq "
INSERT INTO discogs.shelf
SELECT
    release_id, trim(Artist), trim(Title), Label, \`Catalog#\`, Format, ifNull(Released, ''),
    toUInt8OrNull(Rating), CollectionFolder, \`Date Added\`,
    ifNull(\`Collection Media Condition\`, ''), ifNull(\`Collection Sleeve Condition\`, ''), ifNull(\`Collection Notes\`, '')
FROM format(CSVWithNames,
    '\`Catalog#\` String, Artist String, Title String, Label String, Format String, Rating Nullable(String),
     Released Nullable(String), release_id UInt32, CollectionFolder String, \`Date Added\` DateTime,
     \`Collection Media Condition\` Nullable(String), \`Collection Sleeve Condition\` Nullable(String),
     \`Collection Notes\` Nullable(String)',
    \$\$$(tr -d '\r' < "$CSV")\$\$)"
