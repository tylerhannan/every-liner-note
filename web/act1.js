(() => {
  const D = window.ACT1;
  const { fmt, pct, el, text, rightRounded, clip, cleanName, showTip, hideTip, key, fill, queries, onDraw, onLive, missing, sleeve } = window.VIZ;

  const records = D.records.rows;
  const summary = D.summary.rows[0];
  let genres = D.genres.rows.filter(g => g.discogs_share >= 0.01 || g.shelf_share > 0);
  const years = records.map(r => r.first_out).filter(Boolean).sort((a, b) => a - b);
  // The genre my shelf over-indexes on most, among those with at least two of my records, and which records they are
  const n = records.length;
  function genreCopy() {
    const standout = genres.filter(g => g.shelf_share * n >= 2 && g.discogs_share > 0)
      .sort((a, b) => b.shelf_share / b.discogs_share - a.shelf_share / a.discogs_share)[0] || genres[0];
    const standoutRecords = records.filter(r => (r.genres || []).includes(standout.genre)).map(r => r.title.replace(/ \(.*\)$/, ""));
    const named = standoutRecords.slice(0, 3).join(", ") + (standoutRecords.length > 3 ? `, and ${standoutRecords.length - 3} more` : "");
    fill({ "standout-genre": standout.genre, "standout-shelf": pct(standout.shelf_share), "standout-discogs": pct(standout.discogs_share), "standout-records": named });
  }
  genreCopy();

  fill({
    records: records.length, "first-year": years[0], "last-year": years[years.length - 1],
    people: fmt(summary.people), versions: fmt(summary.versions_of_these_albums),
    releases: `${(summary.releases / 1e6).toFixed(1)} million`,
    updated: D.dates.built, "dump-date": D.dates.dump || "latest", "shelf-date": D.dates.shelf || D.dates.built,
    "stat-releases": `${(summary.releases / 1e6).toFixed(1)}M`, "stat-credits": `${Math.round(summary.credits / 1e6)}M`,
  });

  // Cover wall: every record on the shelf as a sleeve, with the cover from Discogs on hover
  const wall = document.getElementById("cover-wall");
  records.forEach(r => wall.appendChild(sleeve(r)));

  // Genres: shelf share against Discogs share, no colour needed (filled vs hollow)
  function genreDots(container) {
    container.innerHTML = "";
    const W = container.clientWidth, narrow = W < 640;
    const row = 30, m = { l: narrow ? 120 : 190, r: 24, t: 8, b: 28 };
    const H = m.t + m.b + row * genres.length;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, container);
    const xMax = Math.ceil(Math.max(...genres.map(g => Math.max(g.shelf_share, g.discogs_share))) * 10) / 10;
    const x = v => m.l + (W - m.l - m.r) * v / xMax;
    for (let t = 0; t <= xMax + 1e-9; t += 0.1) {
      el("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: t ? "grid" : "axis" }, svg);
      text(svg, x(t), H - 8, Math.round(t * 100) + "%", { "text-anchor": "middle" });
    }
    genres.forEach((g, i) => {
      const cy = m.t + i * row + row / 2;
      text(svg, m.l - 12, cy + 4, narrow ? clip(g.genre, 16) : g.genre, { "text-anchor": "end", class: "label" });
      el("line", { x1: x(g.discogs_share), x2: x(g.shelf_share), y1: cy, y2: cy, stroke: "var(--ink-3)", "stroke-width": 2 }, svg);
      el("circle", { cx: x(g.discogs_share), cy, r: 5, fill: "var(--paper)", stroke: "var(--ink-3)", "stroke-width": 2 }, svg);
      el("circle", { cx: x(g.shelf_share), cy, r: 6, fill: "var(--ink)", stroke: "var(--paper)", "stroke-width": 2 }, svg);
      const hit = el("rect", { x: 0, y: cy - row / 2, width: W, height: row, fill: "transparent" }, svg);
      const ratio = g.discogs_share ? g.shelf_share / g.discogs_share : 0;
      hit.addEventListener("pointermove", () => showTip(container,
        `<div class="row"><b>${g.genre}</b></div>` +
        `<div class="row">${key("var(--ink)", "My shelf")}<span class="num">${pct(g.shelf_share)}</span></div>` +
        `<div class="row"><span class="key">All vinyl since 2015</span><span class="num">${pct(g.discogs_share)}</span></div>` +
        `<div class="row"><span class="key">Ratio</span><span class="num">${ratio ? ratio.toFixed(1) + "×" : "none on my shelf"}</span></div>`,
        x(g.shelf_share), cy));
      hit.addEventListener("pointerleave", hideTip);
    });
  }

  queries(D);
  onDraw(() => genreDots(document.getElementById("chart-genres")));
  // Live: try changing year >= 2015 to year >= 2023
  // The sentence says which vinyl the shelf is compared with, so read the year range back out of the edited SQL
  const sinceWords = sql => {
    const between = sql.match(/year\s+BETWEEN\s+(\d{4})\s+AND\s+(\d{4})/i);
    if (between) return `pressed between ${between[1]} and ${between[2]}`;
    const since = sql.match(/year\s*>=\s*(\d{4})/i);
    return since ? `pressed since ${since[1]}` : "on Discogs";
  };
  fill({ "genre-since": "pressed since 2015" });
  onLive("genres", (rows, sql) => {
    const why = missing(rows, ["genre", "shelf_share", "discogs_share"]);
    if (why) return why;
    fill({ "genre-since": sinceWords(sql) });
    genres = rows.filter(g => g.discogs_share >= 0.01 || g.shelf_share > 0);
    genreCopy();
    genreDots(document.getElementById("chart-genres"));
    return true;
  });
})();
