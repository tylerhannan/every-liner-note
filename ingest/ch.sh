# Source this: talks to ClickHouse Cloud through clickhousectl, so no host or password to juggle.
#   export CH_SERVICE=vinyl   # the Cloud service name
# Set CH_LOCAL=1 to run the same SQL against a local clickhouse-local store instead (handy for testing).

CH_HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# No stdin: inside chq_file's loop it's the statement list, and both clients would read it as data
chq() {
  if [[ -n "${CH_LOCAL:-}" ]]; then
    clickhouse local --path "${CH_LOCAL_PATH:-$CH_HERE/../data/chlocal}" --query "$1" < /dev/null
    return
  fi
  # The Query API gateway stops waiting after about 30 seconds, but the statement keeps running.
  # So tag it, and on a timeout watch the query log until it finishes.
  local tag="chq:$(date +%s)-$RANDOM" out
  if out=$(_cloudq "/* $tag */ $1" 2>&1); then
    [[ -n $out ]] && printf '%s\n' "$out"
    return 0
  fi
  if [[ $out != *query_timeout* ]]; then
    printf '%s\n' "$out" >&2
    return 1
  fi
  echo "    still running on the service, waiting for it" >&2
  local result
  while :; do
    sleep 15
    result=$(_cloudq "SELECT type, exception FROM clusterAllReplicas(default, system.query_log)
      WHERE query LIKE '/* $tag */%' AND type IN ('QueryFinish', 'ExceptionWhileProcessing', 'ExceptionBeforeStart')
      AND event_date >= yesterday() FORMAT TSV" 2>/dev/null) || continue
    [[ -z $result ]] && continue
    [[ $result == QueryFinish* ]] && return 0
    printf '%s\n' "$result" >&2
    return 1
  done
}

_cloudq() {
  clickhousectl cloud service query --name "${CH_SERVICE:?set CH_SERVICE to your Cloud service name}" -q "$1" < /dev/null
}

# The Query API takes one statement per call, so split the file and send them in order
chq_file() {
  local stmt
  while IFS= read -r -d $'\0' stmt; do
    chq "$stmt"
  done < <(python3 -I -c '
import re, sys
sql = re.sub(r"--[^\n]*", "", open(sys.argv[1]).read())
for s in sql.split(";"):
    if s.strip():
        sys.stdout.write(s.strip() + "\0")
' "$1")
}
