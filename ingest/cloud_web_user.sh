#!/usr/bin/env bash
# Create the read-only user the public page connects as. Its password ends up in the page source, so all it gets is
# SELECT on discogs.*, short queries, and a quota for each visitor's IP address.
#   CH_SERVICE=every-liner-note ./ingest/cloud_web_user.sh     # prints the password to put in web/live.js
# Running it again makes a new password, which breaks the page until live.js has it. WEB_PASSWORD=... keeps the old one.
set -euo pipefail
cd "$(dirname "$0")/.."
source ingest/ch.sh
PASSWORD=${WEB_PASSWORD:-$(python3 -I -c 'import secrets; print(f"Liner-{secrets.token_urlsafe(18)}-9")')}

chq "CREATE SETTINGS PROFILE OR REPLACE web_public SETTINGS
  readonly = 2,
  max_execution_time = 20 MAX 20,
  max_result_rows = 10000 MAX 10000,
  result_overflow_mode = 'break' READONLY,
  max_memory_usage = 4000000000 MAX 4000000000,
  max_concurrent_queries_for_user = 8 READONLY"
chq "CREATE USER OR REPLACE web IDENTIFIED WITH sha256_password BY '$PASSWORD' SETTINGS PROFILE 'web_public'"
chq "GRANT SELECT ON discogs.* TO web"
chq "CREATE QUOTA OR REPLACE web_public KEYED BY ip_address
  FOR INTERVAL 1 hour MAX queries = 600, execution_time = 900, read_rows = 30000000000 TO web"
echo "web user ready. Its password, for web/live.js: $PASSWORD"
