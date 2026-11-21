(() => {
  const D = window.ACT3;
  const byRelease = new Map(window.ACT1.records.rows.map(r => [r.release_id, r]));
  const { fmt, el, text, rightRounded, cleanName, showTip, hideTip, queries, aiPanels, onDraw, onLive, missing } = window.VIZ;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // C1: the people who keep turning up, with their build-time aiGenerate note
  const renderGlue = rows => { document.getElementById("glue").innerHTML = rows.map(g => {
    const recs = g.records.map(id => byRelease.get(id)).filter(Boolean)
      .map(r => `<a href="https://www.discogs.com/release/${r.release_id}"><i>${esc(r.title)}</i></a>`).join(", ");
    const note = D.notes[String(g.artist_id)];
    return `<li><span class="glue-name"><a href="https://www.discogs.com/artist/${g.artist_id}">${esc(cleanName(g.person))}</a></span>` +
      `<span class="glue-meta">${esc(g.roles.filter(Boolean).slice(0, 3).join(", "))} · on ${fmt(g.works_overall)} records overall</span>` +
      `<span class="glue-on">${recs}</span>${note ? `<span class="glue-note">${esc(note)}</span>` : ""}</li>`;
  }).join(""); };
  renderGlue(D.glue.rows);

  // C3: what to buy next
  const renderNext = rows => { document.getElementById("next").innerHTML = rows.map(r =>
    `<li><a class="next-title" href="https://www.discogs.com/master/${r.work}">${esc((r.artists || []).map(cleanName).slice(0, 2).join(", "))} · <i>${esc(r.title)}</i></a>` +
    `<span class="glue-meta">${r.year || ""} · ${r.shared_people} people from ${r.from_my_records} of my records</span>` +
    `<span class="glue-on">${esc(r.people.map(cleanName).slice(0, 4).join(", "))}${r.people.length > 4 ? `, and ${r.people.length - 4} more` : ""}</span></li>`).join(""); };
  renderNext(D.next.rows);

  // Live: try families >= 3 for the people, or a different ranking or LIMIT for what to buy next
  onLive("glue", rows => {
    const why = missing(rows, ["artist_id", "person", "roles", "records", "works_overall"]);
    if (why) return why;
    renderGlue(rows);
    return true;
  });
  onLive("next", rows => {
    const why = missing(rows, ["work", "title", "year", "artists", "shared_people", "people", "from_my_records"]);
    if (why) return why;
    renderNext(rows);
    return true;
  });

  queries(D);
  aiPanels(D);
})();
