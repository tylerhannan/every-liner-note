# Local server for live mode

The page runs from static data, and "Run live" sends the same queries to a ClickHouse you connect to.
To test that locally against the data in `data/chlocal`, run from the repo root:

    clickhouse server --config-file=dev/server.xml

Then open `web/index.html`, press **Run live**, and connect to `http://localhost:8123` as user `web`, password `vinyl-local`.

The `web` user is read-only, limited to the `discogs` database, capped at 10 s and 10,000 result rows per query,
and has no grant for AI functions. The server listens on localhost only. Stop it before running `web/build.py`,
because clickhouse-local and the server can't share the data directory at the same time.
