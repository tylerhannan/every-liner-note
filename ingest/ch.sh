# Source this: talks to ClickHouse Cloud through clickhousectl, so no host or password to juggle.
#   export CH_SERVICE=vinyl   # the Cloud service name
# Set CH_LOCAL=1 to run the same SQL against a local clickhouse-local store instead (handy for testing).

CH_HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

chq() {
  if [[ -n "${CH_LOCAL:-}" ]]; then
    clickhouse local --path "${CH_LOCAL_PATH:-$CH_HERE/../data/chlocal}" --query "$1"
  else
    clickhousectl cloud service query --name "${CH_SERVICE:?set CH_SERVICE to your Cloud service name}" -q "$1"
  fi
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
