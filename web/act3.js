(() => {
  const D = window.ACT3;
  const byRelease = new Map(window.ACT1.records.rows.map(r => [r.release_id, r]));
  const { fmt, cleanName, queries, aiPanels, onLive, missing, sleeve } = window.VIZ;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // C1: one card per set of my records that share people, with the build-time aiGenerate notes folded away
  const roleList = g => [...new Set(g.roles.filter(Boolean).map(r => r.replace(/ \(.*\)$/, "")))].slice(0, 3).join(", ");
  const renderGlue = rows => {
    const groups = new Map();
    rows.forEach(g => {
      const key = [...g.records].sort((a, b) => a - b).join(",");
      if (!groups.has(key)) groups.set(key, { records: g.records, people: [] });
      groups.get(key).people.push(g);
    });
    const list = document.getElementById("glue");
    list.innerHTML = "";
    groups.forEach(({ records, people }) => {
      const recs = records.map(id => byRelease.get(id)).filter(Boolean).sort((a, b) => (a.first_out || 9999) - (b.first_out || 9999));
      const li = document.createElement("li");
      li.className = recs.length > 2 ? "pair wide" : "pair";
      const sleeves = document.createElement("div");
      sleeves.className = "pair-sleeves";
      sleeves.style.setProperty("--n", recs.length);
      recs.forEach(r => sleeves.appendChild(sleeve(r, { mini: true })));
      li.appendChild(sleeves);
      const notes = people.map(g => D.notes[String(g.artist_id)]).filter(Boolean);
      li.insertAdjacentHTML("beforeend", `<div class="pair-who"><ul class="pair-people">${people.map(g =>
        `<li><a class="glue-name" href="https://www.discogs.com/artist/${g.artist_id}">${esc(cleanName(g.person))}</a>` +
        `<span class="glue-meta">${esc(roleList(g))} · on ${fmt(g.works_overall)} records in all</span></li>`).join("")}</ul>` +
        (notes.length ? `<details class="pair-notes"><summary>Liner notes, by <code>aiGenerate</code></summary>${notes.map(n => `<p>${esc(n)}</p>`).join("")}</details>` : "") +
        `</div>`);
      list.appendChild(li);
    });
  };
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
