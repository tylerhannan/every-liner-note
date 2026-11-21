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

  // Sleeves are typographic; a real cover is fetched from the Discogs API only when someone hovers or focuses one.
  // API content can't be shown more than 6 hours stale, so covers are cached for 5.5 at most.
  const CACHE_MS = 5.5 * 3600 * 1000;
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("cover:")) continue;
      const c = JSON.parse(localStorage.getItem(k) || "null");
      if (!c || Date.now() - c.t >= CACHE_MS) localStorage.removeItem(k);
    }
  } catch {}
  const cached = id => {
    try {
      const c = JSON.parse(localStorage.getItem("cover:" + id) || "null");
      return c && Date.now() - c.t < CACHE_MS ? c.url : null;
    } catch { return null; }
  };
  const remember = (id, url) => { try { localStorage.setItem("cover:" + id, JSON.stringify({ url, t: Date.now() })); } catch {} };

  // Discogs allows about 25 calls a minute without a login. A burst of 12, then one every 5 seconds, can't go over that
  // in any minute, even for a shelf with far more records missing from the Cover Art Archive than mine.
  const pendingCovers = new Map();
  const BURST = 12, EVERY_MS = 5000;
  let tokens = BURST, refilled = Date.now(), waitUntil = 0;
  const coverUrl = id => {
    const hit = cached(id);
    if (hit) return Promise.resolve(hit);
    if (pendingCovers.has(id)) return pendingCovers.get(id);
    const p = new Promise(resolve => {
      const go = async () => {
        const now = Date.now();
        tokens = Math.min(BURST, tokens + (now - refilled) / EVERY_MS);
        refilled = now;
        const delay = Math.max(waitUntil - now, tokens >= 1 ? 0 : (1 - tokens) * EVERY_MS);
        if (delay > 0) return setTimeout(go, delay);
        tokens -= 1;
        try {
          const res = await fetch(`https://api.discogs.com/releases/${id}`);
          if (res.status === 429) { waitUntil = Date.now() + 60000; return setTimeout(go, 60000); }
          const data = res.ok ? await res.json() : {};
          const image = (data.images || []).find(i => i.type === "primary") || (data.images || [])[0];
          if (image) remember(id, image.uri);
          resolve(image ? image.uri : null);
        } catch { resolve(null); }
      };
      go();
    });
    pendingCovers.set(id, p);
    p.then(() => pendingCovers.delete(id));
    return p;
  };

  // Run fn once el is near the screen. Without IntersectionObserver, run it now.
  const watchers = new Map();
  const observer = "IntersectionObserver" in window ? new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    observer.unobserve(e.target);
    const fn = watchers.get(e.target);
    watchers.delete(e.target);
    if (fn) fn();
  }), { rootMargin: "300px" }) : null;
  const inView = (el, fn) => { if (!observer) return fn(); watchers.set(el, fn); observer.observe(el); };

  // Vinyl colours as the colours themselves, shared by B2's dots and the records on the sleeves
  const SWATCH = {
    grey: "#7d7b78", silver: "#b9bcc1", white: "#ffffff", clear: "#cfd9df", yellow: "#f2c40f", gold: "#c9a227",
    orange: "#ee7a1f", red: "#c8102e", pink: "#f08cb4", purple: "#6c3fa3", blue: "#1f5fbf", green: "#2f8f4e", brown: "#7a4a2a",
    multicolour: "url(#multi)",
  };
  const grooves = c => c === "multicolour" ? "conic-gradient(#c8102e, #f2c40f, #2f8f4e, #1f5fbf, #6c3fa3, #c8102e)"
    : c === "clear" ? "repeating-radial-gradient(circle, #cfd9df88 0 1.2px, #ffffff55 1.2px 2.6px)"
    : `repeating-radial-gradient(circle, ${SWATCH[c]} 0 1.2px, color-mix(in srgb, ${SWATCH[c]}, #fff 22%) 1.2px 2.6px)`;

  // A record on my shelf as a sleeve. The disc's label is coloured by how long after the album this pressing came out,
  // and coloured vinyl comes out in its own colour.
  const band = r => (!r.pressed || !r.first_out ? "unknown" : r.pressed - r.first_out >= 10 ? "reissue" : r.pressed - r.first_out >= 2 ? "catalogue" : "new");
  const sleeve = (r, { mini = false } = {}) => {
    const a = document.createElement("a");
    a.className = mini ? "sleeve mini" : "sleeve";
    a.href = `https://www.discogs.com/release/${r.release_id}`;
    a.style.setProperty("--label", r.pressed && r.first_out ? `var(--${band(r)})` : "var(--ink-3)");
    const vinyl = ((window.ACT1 && window.ACT1.vinyl) || {})[r.release_id];
    if (SWATCH[vinyl]) a.style.setProperty("--grooves", grooves(vinyl));
    a.setAttribute("aria-label", `${cleanName(r.artist)}, ${r.title}, on Discogs`);
    a.innerHTML = `<span class="disc" aria-hidden="true"></span>` +
      `<span class="jacket"><span class="sleeve-text"><span class="sleeve-artist"></span><span class="sleeve-title"></span>` +
      `<span class="sleeve-foot"><span class="sleeve-cat"></span><span class="sleeve-year"></span></span></span>` +
      `<img alt="" decoding="async"><span class="credit">Data provided by Discogs</span>` +
      `<span class="loading" aria-hidden="true">fetching cover…</span></span>`;
    a.querySelector(".sleeve-artist").textContent = cleanName(r.artist);
    a.querySelector(".sleeve-title").textContent = r.title;
    a.querySelector(".sleeve-cat").textContent = r.catno.split(",")[0];
    a.querySelector(".sleeve-year").textContent = r.pressed || "n.d.";
    const img = a.querySelector("img");
    img.alt = `Cover of ${r.title}`;
    // Most covers come from the Cover Art Archive, found at build time, and show straight away.
    // The rest wait for a hover and come from the Discogs API, which can't be kept for more than six hours.
    let caa = ((window.ACT1 && window.ACT1.covers) || {})[r.release_id];
    if (caa) {
      a.classList.add("caa");
      a.querySelector(".credit").textContent = "Cover Art Archive";
      img.loading = "lazy";
      img.addEventListener("load", () => { if (caa) a.classList.add("show-cover"); }, { once: true });
      img.addEventListener("error", () => { caa = null; a.classList.remove("caa", "show-cover"); img.removeAttribute("src"); a.querySelector(".credit").textContent = "Data provided by Discogs"; inView(a, fromDiscogs); }, { once: true });
      img.src = `https://coverartarchive.org/${caa}/front-250`;
    }
    // No Cover Art Archive cover: ask Discogs once the sleeve scrolls into view, and keep its credit showing
    let asked = false;
    const fromDiscogs = () => {
      if (caa || asked) return;
      asked = true;
      a.classList.add("fetching");
      coverUrl(r.release_id).then(url => {
        a.classList.remove("fetching");
        if (!url || caa) return;
        img.addEventListener("load", () => a.classList.add("show-cover"), { once: true });
        img.src = url;
      });
    };
    if (!caa) inView(a, fromDiscogs);
    const show = () => { a.classList.add("out"); fromDiscogs(); };
    const hide = () => a.classList.remove("out");
    a.addEventListener("pointerenter", show);
    a.addEventListener("pointerleave", hide);
    a.addEventListener("focus", show);
    a.addEventListener("blur", hide);
    return a;
  };

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

    // Talk mode: left and right step through the tracks (so do PageUp and PageDown, for clickers). Up and down still scroll.
    document.addEventListener("keydown", ev => {
      // Only text fields keep their arrow keys; a SQL panel's summary keeps focus after a click and must not swallow them
      if (ev.target.closest("input, textarea, select, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const next = ["ArrowRight", "PageDown", "j"].includes(ev.key), prev = ["ArrowLeft", "PageUp", "k"].includes(ev.key);
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

  return { fmt, pct, el, text, niceTicks, topRounded, rightRounded, clip, cleanName, showTip, hideTip, key, fill, queries, aiPanels, onDraw, toast, onLive, missing, sleeve, SWATCH };
})();
