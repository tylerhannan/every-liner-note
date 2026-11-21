// Shared bits for every side of the page: theme, SVG helpers, tooltip, copy fills, query panels, talk mode
window.VIZ = (() => {
  const root = document.documentElement;
  // ?theme=light or ?theme=dark pins the theme, e.g. for a projector
  const urlTheme = new URLSearchParams(location.search).get("theme");
  if (urlTheme === "light" || urlTheme === "dark") root.dataset.theme = urlTheme;

  const NS = "http://www.w3.org/2000/svg";
  const fmt = n => n.toLocaleString("en-US");
  const pct = x => (100 * x).toFixed(1) + "%";
  const tip = document.getElementById("tooltip");

  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  const text = (parent, x, y, s, attrs = {}) => { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };
  const niceTicks = (max, n = 4) => {
    const step0 = max / n, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
    return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
  };
  // Rounded at the data end only, square on the baseline
  const topRounded = (x, y, w, h, r) => {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };
  const rightRounded = (x, y, w, h, r) => {
    r = Math.min(r, h / 2, w);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  };
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  // Discogs disambiguates names with "(2)", which nobody wants to read
  const cleanName = s => String(s).replace(/ \(\d+\)(?=$|[ ,&+])/g, "");

  const showTip = (container, html, x, y) => {
    tip.innerHTML = html;
    tip.classList.add("on");
    const box = container.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = box.left + window.scrollX + x + 14;
    if (left + tw > window.scrollX + root.clientWidth - 8) left = box.left + window.scrollX + x - tw - 14;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = box.top + window.scrollY + y - th / 2 + "px";
  };
  const hideTip = () => tip.classList.remove("on");
  const key = (color, label) => `<span class="key"><i style="background:${color}"></i>${label}</span>`;

  // Numbers in the copy come from the data, so the page stays right after a rescan or a new dump
  const fill = values => document.querySelectorAll("[data-fill]").forEach(n => {
    if (n.dataset.fill in values) n.textContent = values[n.dataset.fill];
  });

  // Light SQL highlighting: comments, strings, {params}, keywords, functions, numbers. Escaped first, so it's safe as HTML.
  const KW = new Set("SELECT FROM WHERE AND OR NOT IN AS ON JOIN LEFT RIGHT FULL INNER ANY ALL GROUP BY ORDER HAVING LIMIT WITH UNION DISTINCT CASE WHEN THEN ELSE END IS NULL BETWEEN DESC ASC SETTINGS OVER PARTITION ROWS UNBOUNDED PRECEDING ARRAY FORMAT".split(" "));
  const escHtml = t => t.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const highlight = sql => sql.split(/(--[^\n]*|'(?:[^'\\]|\\.)*'|\{[a-z_]+:[A-Za-z0-9]+\}|\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*\()|\b[A-Za-z_]+\b|\b\d[\d.]*\b)/g).map(t => {
    if (!t) return "";
    if (t.startsWith("--")) return `<span class="sql-c">${escHtml(t)}</span>`;
    if (t.startsWith("'")) return `<span class="sql-s">${escHtml(t)}</span>`;
    if (t.startsWith("{")) return `<span class="sql-p">${escHtml(t)}</span>`;
    if (/^\d/.test(t)) return `<span class="sql-n">${t}</span>`;
    if (KW.has(t.toUpperCase()) && /^[A-Za-z]+$/.test(t)) return `<span class="sql-k">${t}</span>`;
    return escHtml(t);
  }).join("").replace(/\b([A-Za-z_][A-Za-z0-9_]*)(\s*\()/g, (m, f, p) => (KW.has(f.toUpperCase()) ? m : `<span class="sql-f">${f}</span>${p}`));

  const toastEl = document.createElement("div");
  toastEl.className = "toast"; toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  let toastTimer;
  const toast = msg => { toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("on"), 1600); };
  // Read the SQL out of an editable box whether or not its panel is open. innerText needs the box to be laid out,
  // and textContent drops the <br> or <div> a browser inserts when you press Enter, so walk the nodes instead.
  const sqlText = node => {
    let out = "";
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) out += n.data;
      else if (n.nodeName === "BR") out += "\n";
      else if (n.nodeName === "DIV" || n.nodeName === "P") out += (out && !out.endsWith("\n") ? "\n" : "") + sqlText(n) + "\n";
      else out += sqlText(n);
    });
    return out;
  };
  const withCopy = pre => {
    const wrap = document.createElement("div");
    wrap.className = "code";
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "copy"; btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(sqlText(pre)); toast("SQL copied"); } catch { toast("Couldn't copy from this page"); }
    });
    wrap.appendChild(btn);
  };

  // A section can redraw itself from a live result: register a handler for its query's name
  const liveHooks = {};
  const onLive = (name, fn) => { liveHooks[name] = fn; };
  // For a hook: the columns a live result is missing, as a message, or "" when it has them all
  const missing = (rows, cols) => {
    if (!rows.length) return "no rows came back, so the page stays as it was";
    const gone = cols.filter(c => !(c in rows[0]));
    return gone.length ? `the result has no ${gone.join(", ")} column${gone.length > 1 ? "s" : ""}, so the page stays as it was` : "";
  };
  const flash = section => {
    if (!section) return;
    section.querySelectorAll("[data-fill], .chart, ol.people").forEach(n => { n.classList.remove("updated"); void n.offsetWidth; n.classList.add("updated"); });
  };

  // Each query block shows what it cost, the SQL, and the numbers as a table
  const plain = new Set(["year", "first_out", "pressed", "release_id"]);
  const queries = (data, views = {}) => document.querySelectorAll("details.query").forEach(det => {
    const q = data[det.dataset.query];
    if (!q) return;
    const rows = det.dataset.view ? views[det.dataset.view]() : q.rows;
    const cols = Object.keys(rows[0]);
    const cell = (c, v) => (typeof v === "number" && !plain.has(c) ? fmt(v) : Array.isArray(v) ? v.join(", ") : v);
    det.innerHTML = `<summary><span class="q-tag">SQL</span><span class="q-stats">${fmt(q.rows_read)} rows read in ${q.elapsed_s} s</span>` +
      `<button type="button" class="q-live">Run live</button>` +
      `<span class="q-cta"><span class="q-show">Show SQL and data</span><span class="q-hide">Hide SQL and data</span></span></summary>` +
      `<pre></pre><div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
      rows.map(r => `<tr>${cols.map(c => `<td>${cell(c, r[c])}</td>`).join("")}</tr>`).join("") + `</tbody></table></div>`;
    const pre = det.querySelector("pre");
    pre.innerHTML = highlight(q.sql);
    withCopy(pre);
    // When connected, the SQL is editable: change it, press Run live, and your version runs
    pre.setAttribute("spellcheck", "false");
    const editable = () => pre.setAttribute("contenteditable", document.documentElement.classList.contains("is-live") ? "plaintext-only" : "false");
    editable();
    if (window.LIVE) window.LIVE.onChange(editable);
    const stats = det.querySelector(".q-stats");
    const table = det.querySelector("table");
    det.querySelector(".q-live").addEventListener("click", async ev => {
      ev.preventDefault(); ev.stopPropagation();
      const sql = sqlText(pre);
      const edited = sql.trim() !== q.sql.trim();
      stats.textContent = "running live…";
      try {
        const r = await window.LIVE.query(sql, q.params || {});
        stats.innerHTML = `<b class="live-dot">live${edited ? ", your edit" : ""}</b> ${fmt(r.rows_read)} rows read in ${r.elapsed_s.toFixed(3)} s · ${fmt(r.rows.length)} rows back`;
        if (r.rows.length && (!det.dataset.view || edited)) {
          const c2 = Object.keys(r.rows[0]);
          table.innerHTML = `<thead><tr>${c2.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
            r.rows.map(row => `<tr>${c2.map(c => `<td>${cell(c, row[c])}</td>`).join("")}</tr>`).join("") + `</tbody>`;
        }
        const hook = liveHooks[det.dataset.query];
        if (hook) {
          const res = hook(r.rows, sql);
          if (typeof res === "string") stats.innerHTML += ` · ${res}`;
          else flash(det.closest(".track"));
        }
        if (edited) det.open = true;
      } catch (err) { stats.textContent = err.message.slice(0, 300); det.open = true; }
    });
  });

  // SQL that ran AI functions once at build time: shown, never run live
  const aiPanels = data => document.querySelectorAll("details.ai-query").forEach(det => {
    const sql = data[det.dataset.ai];
    if (typeof sql !== "string") return;
    det.innerHTML = `<summary><span class="q-tag q-ai">AI</span><span class="q-stats">ran once at build time, not live</span>` +
      `<span class="q-cta"><span class="q-show">Show SQL</span><span class="q-hide">Hide SQL</span></span></summary><pre></pre>`;
    const pre = det.querySelector("pre");
    pre.innerHTML = highlight(sql);
    withCopy(pre);
  });

  const drawers = [];
  const onDraw = fn => { drawers.push(fn); fn(); };
  const redraw = () => drawers.forEach(fn => fn());
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(redraw, 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = dark ? "light" : "dark";
      redraw();
    });
    // The spine: the current side down the left margin, like a record's spine, with a tick for each track
    const tracks = [...document.querySelectorAll(".track")];
    const sideOf = t => { let n = t.previousElementSibling; while (n && !n.classList.contains("side-label")) n = n.previousElementSibling; return n; };
    // Each track says "Side A · Track 2" in full; the spine keeps the short "A2"
    const shortName = new Map();
    tracks.forEach(t => {
      const no = t.querySelector(".track-no");
      if (!no) return;
      shortName.set(t.id, no.textContent.trim());
      const side = sideOf(t);
      const sideName = side ? side.querySelector(".side").textContent.trim() : "";
      const siblings = tracks.filter(x => sideOf(x) === side);
      no.textContent = /hidden/i.test(sideName) ? sideName : `${sideName} · Track ${siblings.indexOf(t) + 1}`;
    });
    const spine = document.createElement("nav");
    spine.className = "spine";
    spine.setAttribute("aria-label", "Sides and tracks");
    spine.innerHTML = `<span class="spine-side"></span><span class="spine-ticks">${tracks.map(t =>
      `<a href="#${t.id}" data-for="${t.id}" title="${(t.querySelector("h2") || {}).textContent || t.id}">${shortName.get(t.id) || ""}</a>`).join("")}</span>`;
    document.body.appendChild(spine);
    const spineSide = spine.querySelector(".spine-side");
    const showTrack = t => {
      const side = sideOf(t);
      spineSide.textContent = side ? [...side.querySelectorAll("span")].map(x => x.textContent).join(" · ") : "";
      spine.querySelectorAll("a").forEach(a => a.classList.toggle("on", a.dataset.for === t.id));
    };
    const watch = () => {
      const line = window.innerHeight * 0.35;
      const current = [...tracks].reverse().find(t => t.getBoundingClientRect().top <= line) || tracks[0];
      if (current) showTrack(current);
      spine.classList.toggle("off", window.scrollY < 200);
    };
    window.addEventListener("scroll", watch, { passive: true });
    watch();

    // Talk mode: arrow keys step through the tracks
    document.addEventListener("keydown", ev => {
      // Only text fields keep their arrow keys; a SQL panel's summary keeps focus after a click and must not swallow them
      if (ev.target.closest("input, textarea, select, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const next = ["ArrowDown", "ArrowRight", "PageDown", "j"].includes(ev.key), prev = ["ArrowUp", "ArrowLeft", "PageUp", "k"].includes(ev.key);
      if (!next && !prev) return;
      ev.preventDefault();
      const mid = window.innerHeight * 0.3;
      let i = tracks.findIndex(s => s.getBoundingClientRect().top > mid + 1);
      if (i === -1) i = tracks.length;
      const target = next ? tracks[Math.min(i, tracks.length - 1)] : tracks[Math.max(0, i - 2)];
      // A side's first track scrolls to the side header, so you can see which side you're on
      const side = sideOf(target);
      (side && side.nextElementSibling === target ? side : target).scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    });
  });

  return { fmt, pct, el, text, niceTicks, topRounded, rightRounded, clip, cleanName, showTip, hideTip, key, fill, queries, aiPanels, onDraw, toast, onLive, missing };
})();
