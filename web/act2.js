(() => {
  const D = window.ACT2;
  const { fmt, pct, el, text, niceTicks, topRounded, rightRounded, clip, cleanName, showTip, hideTip, key, fill, queries, aiPanels, onDraw, onLive, missing } = window.VIZ;

  let years, latest, full, y1975;
  // The last year is partial (up to the dump date); headlines use the last full year
  function setYears(rows) {
    years = rows.map(r => ({ ...r, total: r.new + r.catalogue + r.reissue, share: r.reissue / (r.new + r.catalogue + r.reissue) }));
    latest = years[years.length - 1];
    full = years[years.length - 2] || latest;
    y1975 = years.find(r => r.year === 1975) || years[0];
  }
  setYears(D.revival_by_age.rows);
  const shelfAll = D.shelf.rows.map(r => ({ ...r, gap: r.pressed && r.first_out ? r.pressed - r.first_out : null }));
  // Percentages only use records where Discogs knows both years
  const shelf = shelfAll.filter(r => r.gap !== null);
  const band = gap => (gap >= 10 ? "reissue" : gap >= 2 ? "catalogue" : "new");
  const shelfReissues = shelf.filter(r => r.gap >= 10).length;
  const shelfShare = shelfReissues / shelf.length;

  const revivalCopy = () => fill({ "share-latest": pct(full.share), "latest-year": full.year, "partial-year": latest.year, "share-1975": pct(y1975.share) });
  revivalCopy();
  fill({
    "shelf-reissues": shelfReissues, "shelf-dated": shelf.length, "shelf-share": pct(shelfShare), "shelf-undated": shelfAll.length - shelf.length,
  });

  // B2: colours. These hexes are the vinyl colours themselves, so colour is the data here, not an encoding.
  const SWATCH = {
    grey: "#7d7b78", silver: "#b9bcc1", white: "#ffffff", clear: "#cfd9df", yellow: "#f2c40f", gold: "#c9a227",
    orange: "#ee7a1f", red: "#c8102e", pink: "#f08cb4", purple: "#6c3fa3", blue: "#1f5fbf", green: "#2f8f4e", brown: "#7a4a2a",
    multicolour: "url(#multi)",
  };
  const pale = c => ["white", "clear", "silver", "yellow"].includes(c);
  const stats = D.colour_stats.rows[0];
  // Compare like with like: of records that name a colour other than black, what share is each colour
  const mineByColour = {};
  D.shelf_colours.rows.forEach(r => { (mineByColour[r.colour] = mineByColour[r.colour] || []).push(r); });
  const mineTotal = D.shelf_colours.rows.length;
  let colourRows;
  function setColours(rows) {
    const everyone = rows.filter(c => c.colour !== "black" && c.colour !== "not a colour");
    const everyoneTotal = everyone.reduce((a, c) => a + c.pressings, 0);
    colourRows = everyone.map(c => ({ colour: c.colour, all: c.pressings / everyoneTotal, mine: (mineByColour[c.colour] || []).length / mineTotal, records: mineByColour[c.colour] || [] }))
      .sort((a, b) => b.all - a.all);
    const topMine = [...colourRows].sort((a, b) => b.mine - a.mine)[0];
    fill({ "top-colour-all": colourRows[0].colour, "top-colour-mine": topMine && topMine.mine > 0 ? topMine.colour : "black" });
  }
  setColours(D.colours.rows);
  const check = D.reissue_check.rows[0];
  fill({ "colour-phrases": fmt(stats.phrases), "tagged-share": pct(check.tagged), "comp-share": pct(check.compilations_counted_new) });

  function colourDots(container) {
    container.innerHTML = "";
    const W = container.clientWidth, narrow = W < 640, row = 30;
    const m = { l: narrow ? 96 : 120, r: 24, t: 8, b: 28 };
    const H = m.t + m.b + row * colourRows.length;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, container);
    const grad = el("linearGradient", { id: "multi", x1: 0, x2: 1, y1: 0, y2: 1 }, el("defs", {}, svg));
    ["#c8102e", "#f2c40f", "#2f8f4e", "#1f5fbf", "#6c3fa3"].forEach((c, i) => el("stop", { offset: i / 4, "stop-color": c }, grad));
    const xMax = Math.ceil(Math.max(...colourRows.map(c => Math.max(c.all, c.mine))) * 10) / 10;
    const x = v => m.l + (W - m.l - m.r) * v / xMax;
    for (let t = 0; t <= xMax + 1e-9; t += 0.1) {
      el("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: t ? "grid" : "axis" }, svg);
      text(svg, x(t), H - 8, Math.round(t * 100) + "%", { "text-anchor": "middle" });
    }
    colourRows.forEach((c, i) => {
      const cy = m.t + i * row + row / 2;
      text(svg, m.l - 12, cy + 4, c.colour, { "text-anchor": "end", class: "label" });
      el("line", { x1: x(c.all), x2: x(c.mine), y1: cy, y2: cy, stroke: "var(--ink-3)", "stroke-width": 2 }, svg);
      el("circle", { cx: x(c.all), cy, r: 5, fill: "var(--paper)", stroke: "var(--ink-3)", "stroke-width": 2 }, svg);
      el("circle", { cx: x(c.mine), cy, r: 7, fill: SWATCH[c.colour] || "#999", stroke: pale(c.colour) ? "var(--ink-3)" : "var(--paper)", "stroke-width": 2 }, svg);
      const hit = el("rect", { x: 0, y: cy - row / 2, width: W, height: row, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", () => showTip(container, `<div class="row"><b>${c.colour}</b></div>` +
        `<div class="row"><span class="key">My coloured records</span><span class="num">${pct(c.mine)}</span></div>` +
        `<div class="row"><span class="key">All limited vinyl since 2015</span><span class="num">${pct(c.all)}</span></div>` +
        (c.records.length ? `<div class="row"><span class="key">${c.records.map(r => r.title).slice(0, 3).join(", ")}</span></div>` : ""),
        x(c.mine), cy));
      hit.addEventListener("pointerleave", hideTip);
    });
  }

  function share(container) {
    container.innerHTML = "";
    const W = container.clientWidth, H = Math.max(220, Math.min(320, W * 0.36));
    const m = { l: 48, r: 96, t: 16, b: 28 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, container);
    const x0 = years[0].year, x1 = latest.year + 1;
    const x = yr => m.l + (W - m.l - m.r) * (yr - x0) / (x1 - x0);
    const yMax = 0.4;
    const y = v => m.t + (H - m.t - m.b) * (1 - v / yMax);
    [0, 0.1, 0.2, 0.3, 0.4].forEach(t => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t ? "grid" : "axis" }, svg);
      text(svg, m.l - 8, y(t) + 4, t * 100 + "%", { "text-anchor": "end" });
    });
    const step = W < 640 ? 20 : 10;
    for (let yr = 1960; yr <= 2020; yr += step) text(svg, x(yr), H - 8, yr, { "text-anchor": "middle" });
    el("path", { d: years.slice(0, -1).map((r, i) => `${i ? "L" : "M"}${x(r.year)},${y(r.share)}`).join(""), fill: "none", stroke: "var(--reissue)", "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    // The partial year gets a dashed tail and a hollow dot
    el("line", { x1: x(full.year), y1: y(full.share), x2: x(latest.year), y2: y(latest.share), stroke: "var(--reissue)", "stroke-width": 2, "stroke-dasharray": "3 3" }, svg);
    el("circle", { cx: x(latest.year), cy: y(latest.share), r: 4, fill: "var(--paper)", stroke: "var(--reissue)", "stroke-width": 2 }, svg);
    el("circle", { cx: x(full.year), cy: y(full.share), r: 4, fill: "var(--reissue)", stroke: "var(--paper)", "stroke-width": 2 }, svg);
    text(svg, x(latest.year) + 10, y(full.share) + 4, `${pct(full.share)} in ${full.year}`, { class: "label" });

    // The shelf, placed at the median year its records were pressed
    const pressed = shelf.map(r => r.pressed).sort((a, b) => a - b);
    const shelfYear = pressed[Math.floor(pressed.length / 2)];
    const sy = y(shelfShare), sx = x(shelfYear);
    // My shelf as a ringed dot with its label underneath, clear of the line's own end label
    el("line", { x1: x(2008), x2: sx - 7, y1: sy, y2: sy, stroke: "var(--ink-3)", "stroke-width": 1, "stroke-dasharray": "3 3" }, svg);
    el("circle", { cx: sx, cy: sy, r: 5, fill: "var(--paper)", stroke: "var(--ink)", "stroke-width": 2 }, svg);
    text(svg, x(2008) - 6, sy + 4, `my shelf ${pct(shelfShare)}`, { "text-anchor": "end", class: "label" });

    const cursor = el("line", { y1: m.t, y2: H - m.b, class: "cursor", opacity: 0 }, svg);
    const dot = el("circle", { r: 4, fill: "var(--reissue)", stroke: "var(--paper)", "stroke-width": 2, opacity: 0 }, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const yr = Math.round(x0 + (ev.offsetX - m.l) / (W - m.l - m.r) * (x1 - x0));
      const r = years.find(d => d.year === Math.max(x0, Math.min(latest.year, yr)));
      cursor.setAttribute("x1", x(r.year)); cursor.setAttribute("x2", x(r.year)); cursor.setAttribute("opacity", 1);
      dot.setAttribute("cx", x(r.year)); dot.setAttribute("cy", y(r.share)); dot.setAttribute("opacity", 1);
      showTip(container, `<div class="row"><b>${r.year}</b></div><div class="row"><span class="key">Reissue share</span><span class="num">${pct(r.share)}</span></div>` +
        `<div class="row"><span class="key">Avg age of reissued album</span><span class="num">${r.reissue_avg_age} yrs</span></div>`, x(r.year), y(r.share));
    });
    hit.addEventListener("pointerleave", () => { hideTip(); cursor.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); });
  }

  function dumbbell(container) {
    container.innerHTML = "";
    const W = container.clientWidth, narrow = W < 640;
    const row = narrow ? 40 : 26;
    const m = { l: narrow ? 8 : 300, r: 16, t: 8, b: 28 };
    const H = m.t + m.b + row * shelfAll.length;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, container);
    const x0 = 1950, x1 = 2026;
    const x = yr => m.l + (W - m.l - m.r) * (yr - x0) / (x1 - x0);
    for (let yr = 1950; yr <= 2020; yr += 10) {
      el("line", { x1: x(yr), x2: x(yr), y1: m.t, y2: H - m.b, class: "grid" }, svg);
      text(svg, x(yr), H - 8, yr, { "text-anchor": "middle" });
    }
    shelfAll.forEach((r, i) => {
      const cy = m.t + i * row + (narrow ? 28 : row / 2);
      const c = r.gap === null ? "var(--ink-3)" : `var(--${band(r.gap)})`;
      const label = `${cleanName(r.artist)} · ${r.title}`;
      if (narrow) text(svg, m.l, cy - 14, clip(label, 46), { class: "label-2" });
      else text(svg, m.l - 14, cy + 4, clip(label, 40), { "text-anchor": "end", class: "label" });
      if (r.gap > 0) el("line", { x1: x(r.first_out), x2: x(r.pressed), y1: cy, y2: cy, stroke: c, "stroke-width": 2 }, svg);
      if (r.first_out) el("circle", { cx: x(r.first_out), cy, r: 4, fill: "var(--paper)", stroke: "var(--ink-3)", "stroke-width": 2 }, svg);
      // Undated pressing: a question mark where the pressing would go; a bootleg: just the pressing, in neutral ink
      if (r.pressed) el("circle", { cx: x(r.pressed), cy, r: 5, fill: c, stroke: "var(--paper)", "stroke-width": 2 }, svg);
      else text(svg, x(r.first_out) + 10, cy + 4, "?", { class: "label-2" });
      const hit = el("rect", { x: 0, y: cy - row / 2, width: W, height: row, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", () => showTip(container,
        `<div class="row"><b>${r.title}</b></div><div class="row"><span class="key">${r.artist}</span></div>` +
        `<div class="row"><span class="key">First released</span><span class="num">${r.first_out || "not an album (bootleg)"}</span></div>` +
        `<div class="row">${key(c, "This pressing")}<span class="num">${r.pressed || "not dated on Discogs"}</span></div>` +
        `<div class="row"><span class="key">${r.label} · ${r.catno}</span></div>`, x(r.pressed || r.first_out), cy));
      hit.addEventListener("pointerleave", hideTip);
    });
  }

  queries(D, { share: () => years.map(r => ({ year: r.year, reissue_share: pct(r.share), avg_age_of_reissued_album: r.reissue_avg_age })) });
  onDraw(() => share(document.getElementById("chart-share")));
  onDraw(() => colourDots(document.getElementById("chart-colours")));
  // Live: try changing >= 10 to >= 20 (years between album and pressing), or the year range
  onLive("revival_by_age", rows => {
    const why = missing(rows, ["year", "new", "catalogue", "reissue"]);
    if (why) return why;
    setYears(rows);
    revivalCopy();
    share(document.getElementById("chart-share"));
    return true;
  });
  // Live: try a different year, or drop the 'Limited Edition' condition
  onLive("colours", rows => {
    const why = missing(rows, ["colour", "pressings"]);
    if (why) return why;
    setColours(rows);
    colourDots(document.getElementById("chart-colours"));
    return true;
  });
  // The record-by-record chart sits in a collapsed panel, so draw it when it opens and has a width
  const more = document.querySelector("#b1 details.more");
  const drawShelf = () => { if (more.open) dumbbell(document.getElementById("chart-shelf")); };
  more.addEventListener("toggle", drawShelf);
  onDraw(drawShelf);
  aiPanels(D);
})();
