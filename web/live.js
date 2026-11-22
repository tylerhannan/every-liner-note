// Live mode: the same queries the page was built from, run against my ClickHouse Cloud service or your own ClickHouse.
// Same approach as kill-your-dashboards: a text/plain POST with credentials as URL parameters is a "simple" CORS
// request, so there's no preflight, and add_http_cors_header=1 makes ClickHouse send Access-Control-Allow-Origin.
window.LIVE = (() => {
  // My ClickHouse Cloud service and its public read-only user, so Run live works without typing anything. The password
  // is public on purpose: the user can only read the discogs tables, briefly, within a quota per visitor
  // (ingest/cloud_web_user.sh). In a fork, point this at your own service, or set it to null.
  const PUBLIC = { name: "ClickHouse Cloud", url: "https://cfb9jw9292.us-east-1.aws.clickhouse.cloud:8443", user: "web", password: "Liner-OQkjP_npUvD6hR_mKztwPBjj-9" };
  const KEY = "live-connection";
  let conn = null;
  try { conn = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch {}
  // Mark the page live now, before the SQL panels are built, so a remembered connection makes them editable straight away
  document.documentElement.classList.toggle("is-live", !!conn);
  const listeners = [];

  async function query(sql, params = {}) {
    if (!conn && PUBLIC) set(PUBLIC, true);
    if (!conn) throw new Error("Not connected. Press Run live at the top of the page to connect a ClickHouse.");
    const u = new URL(conn.url);
    u.searchParams.set("add_http_cors_header", "1");
    u.searchParams.set("output_format_json_quote_64bit_integers", "0");
    u.searchParams.set("user", conn.user);
    if (conn.password) u.searchParams.set("password", conn.password);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(`param_${k}`, String(v));
    let res;
    const t0 = performance.now();
    try {
      res = await fetch(u.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: sql.trim().replace(/;\s*$/, "") + "\nFORMAT JSON",
      });
    } catch (err) {
      throw new Error(`Could not reach ${conn.url}. Check the URL, scheme (http vs https) and port, and that CORS is allowed for this origin. (${err.message})`);
    }
    if (!res.ok) throw new Error(`ClickHouse returned ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const json = await res.json();
    return { rows: json.data, elapsed_s: json.statistics.elapsed, rows_read: json.statistics.rows_read, wall_s: (performance.now() - t0) / 1000 };
  }

  const connected = () => !!conn;
  const set = (c, remember) => {
    conn = c;
    try { remember && c ? sessionStorage.setItem(KEY, JSON.stringify(c)) : sessionStorage.removeItem(KEY); } catch {}
    document.documentElement.classList.toggle("is-live", !!c);
    listeners.forEach(fn => fn(!!c));
  };
  const onChange = fn => listeners.push(fn);

  // The connect dialog
  document.addEventListener("DOMContentLoaded", () => {
    const dlg = document.getElementById("connect");
    const form = dlg.querySelector("form");
    const status = dlg.querySelector(".connect-status");
    const btn = document.getElementById("connect-open");
    const label = () => { btn.textContent = conn ? `Live · ${conn.name || new URL(conn.url).host}` : "Run live"; };
    const own = dlg.querySelector(".connect-own");
    const pub = dlg.querySelector("[data-public]");
    if (PUBLIC) {
      pub.querySelector("[data-public-connect]").addEventListener("click", async () => {
        status.textContent = "Connecting. If nobody's used it for a while it has to wake up, which can take up to half a minute.";
        const prev = conn;
        conn = PUBLIC;
        try {
          await query("SELECT count() AS n FROM discogs.edges");
          set(PUBLIC, true);
          status.textContent = "";
          dlg.close();
          if (window.VIZ) window.VIZ.toast("Connected. Edit any SQL panel and press its Run live.");
        } catch (err) { conn = prev; status.textContent = err.message; }
      });
    } else {
      pub.hidden = true;
      own.open = true;
    }
    document.documentElement.classList.toggle("is-live", !!conn);
    label();
    onChange(label);
    btn.addEventListener("click", () => {
      if (conn && conn !== PUBLIC && conn.url !== (PUBLIC || {}).url) { form.url.value = conn.url; form.user.value = conn.user; own.open = true; }
      status.textContent = "";
      dlg.showModal();
    });
    dlg.querySelector("[data-disconnect]").addEventListener("click", () => { set(null); dlg.close(); });
    dlg.querySelector("[data-cancel]").addEventListener("click", () => dlg.close());
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const c = { url: form.url.value.trim().replace(/\/$/, ""), user: form.user.value.trim() || "default", password: form.password.value };
      status.textContent = "Checking…";
      const prev = conn;
      conn = c;
      try {
        const r = await query("SELECT count() AS n FROM discogs.edges");
        set(c, form.remember.checked);
        status.textContent = "";
        form.password.value = "";
        dlg.close();
        console.info(`Connected: discogs.edges has ${r.rows[0].n} rows`);
      } catch (err) {
        conn = prev;
        status.textContent = err.message.includes("UNKNOWN_DATABASE") || err.message.includes("UNKNOWN_TABLE")
          ? "Connected, but this server has no discogs database. Load it first (see the README)." : err.message;
      }
    });
  });

  return { query, connected, onChange };
})();
