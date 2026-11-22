(() => {
  const D = window.ACT4;
  const { fmt, cleanName, fill, queries, onLive } = window.VIZ;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const whose = name => (name.endsWith("s") ? `${name}'` : `${name}'s`);
  const mins = sec => `${Math.round(sec / 60)} minutes`;

  // H1: how long the shelf is. Also runs on live results, so editing the SQL (say, LIMIT 5) redraws the numbers.
  let timed = [];
  function runtime(rows) {
    const t = rows.filter(r => Number(r.seconds) > 0);
    if (!t.length || !("discs" in rows[0])) return false;
    timed = t;
    const total = timed.reduce((a, r) => a + Number(r.seconds), 0);
    const sides = rows.reduce((a, r) => a + 2 * Number(r.discs || 1), 0);
    const done = new Date(new Date(2026, 10, 20, 19, 0, 0).getTime() + total * 1000);
    const longest = timed.reduce((m, r) => (Number(r.seconds) > Number(m.seconds) ? r : m), timed[0]);
    const shortest = timed.reduce((m, r) => (Number(r.seconds) < Number(m.seconds) ? r : m), timed[0]);
    const hours = total / 3600;
    fill({
      hours: hours >= 1.5 ? `${Math.round(hours)} hours` : `${Math.round(total / 60)} minutes`,
      sides: fmt(sides), flips: fmt(Math.max(0, sides - 1)),
      "done-at": `${done.toLocaleDateString("en-GB", { weekday: "long" })} at ${done.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`,
      longest: `${whose(cleanName(longest.artist))} ${longest.title} at ${mins(longest.seconds)}`,
      shortest: `${whose(cleanName(shortest.artist))} ${shortest.title} at ${mins(shortest.seconds)}`,
    });
    fit();
    return true;
  }

  // What fits the time I've got: the combination of up to four records that fills it best without going over,
  // fewest records on a tie. Connected, ClickHouse works it out (sql/act4/fit.sql); otherwise the browser does.
  const input = document.getElementById("fit-minutes");
  const out = document.getElementById("fit-out");
  const tidy = t => String(t).replace(/[\u200e\u200f]/g, "").trim();
  function inBrowser(cap) {
    const items = timed.map(r => ({ title: r.title, artist: r.artist, m: Math.max(1, Math.round(Number(r.seconds) / 60)) }));
    // reach[k][t]: a way to fill exactly t minutes with k records, as [previous t, item]
    const reach = Array.from({ length: 5 }, () => new Array(cap + 1).fill(null));
    reach[0][0] = [-1, -1];
    items.forEach((it, i) => {
      for (let k = 4; k >= 1; k--) for (let t = cap; t >= it.m; t--) {
        if (reach[k - 1][t - it.m] && !reach[k][t]) reach[k][t] = [t - it.m, i];
      }
    });
    for (let t = cap; t > 0; t--) for (let k = 1; k <= 4; k++) if (reach[k][t]) {
      const picked = [];
      for (let kk = k, tt = t; kk > 0; kk--) { const [pt, i] = reach[kk][tt]; picked.push(items[i]); tt = pt; }
      return { total: t, spare: cap - t, titles: picked.map(p => p.title), artists: picked.map(p => p.artist), record_minutes: picked.map(p => p.m), how: "Worked out in your browser. Connect with Run live and ClickHouse does it." };
    }
    return null;
  }
  function render(best) {
    if (!best || !best.titles || !best.titles.length) { out.innerHTML = `<p>Nothing on my shelf is that short. Put the kettle on instead.</p>`; return; }
    const order = best.titles.map((t, i) => i).sort((a, b) => best.record_minutes[b] - best.record_minutes[a]);
    const list = order.map(i => `<li><span class="fit-title"><i>${esc(tidy(best.titles[i]))}</i></span> ` +
      `<span class="fit-by">${esc(cleanName(best.artists[i]))} · ${best.record_minutes[i]} min</span></li>`).join("");
    const n = best.titles.length;
    out.innerHTML = `<p class="fit-sum">${n === 1 ? "One record" : `${n} records`}, ${best.total} minutes${best.spare ? `, with ${best.spare} to spare` : ", exactly"}.</p>` +
      `<ol class="fit-list">${list}</ol><p class="footnote">${best.how}</p>`;
  }
  let pending;
  // An edit run from the SQL panel (a Try button, say) keeps driving the picker until it's put back
  let fitSql = D.fit.sql;
  function fit() {
    if (!input || !out) return;
    const cap = Math.max(1, Math.min(6000, Math.round(Number(input.value) || 0)));
    D.fit.params.minutes = cap;
    clearTimeout(pending);
    if (window.LIVE && window.LIVE.connected()) {
      out.querySelector(".footnote") && (out.querySelector(".footnote").textContent = "asking ClickHouse…");
      pending = setTimeout(async () => {
        try {
          const r = await window.LIVE.query(fitSql, { minutes: cap });
          const row = r.rows[0];
          render(row ? { ...row, how: `<b class="live-dot">live</b> from ClickHouse: ${fmt(row.combinations_that_fit)} combinations fit, best found in ${r.elapsed_s.toFixed(3)} s` } : null);
        } catch (err) { const b = inBrowser(cap); if (b) b.how = `ClickHouse didn't answer (${esc(err.message.slice(0, 80))}), so this was worked out in your browser`; render(b); }
      }, 250);
    } else render(inBrowser(cap));
  }
  if (input) {
    input.addEventListener("input", fit);
    document.querySelectorAll("[data-fit]").forEach(b => b.addEventListener("click", () => { input.value = b.dataset.fit; fit(); }));
    if (window.LIVE) window.LIVE.onChange(() => fit());
  }

  runtime(D.runtime.rows);
  onLive("runtime", rows => runtime(rows) || "these rows have no seconds and discs columns, so the numbers above stay as they were");
  onLive("fit", (rows, sql) => {
    const row = rows[0];
    if (row && !Array.isArray(row.titles)) return "these rows have no titles column, so the list above stays as it was";
    fitSql = sql;
    render(row ? { ...row, how: `<b class="live-dot">live</b> from the SQL panel${sql.trim() !== D.fit.sql.trim() ? ", with your edit" : ""}: ${fmt(row.combinations_that_fit)} combinations fit` } : null);
    return true;
  });
  queries(D);
})();
