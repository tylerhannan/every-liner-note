(() => {
  const D = window.ACT3;
  const byRelease = new Map(window.ACT1.records.rows.map(r => [r.release_id, r]));
  const { fmt, cleanName, queries, aiPanels, onLive, missing, sleeve, showTip, hideTip } = window.VIZ;
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

  // C2: search everyone credited on Discogs, live as you type, then one person's credits by role and decade
  const input = document.getElementById("search-name");
  const hitsEl = document.getElementById("search-hits");
  const personEl = document.getElementById("search-person");
  const statusEl = document.getElementById("search-status");
  let searchSql = D.search.sql, personSql = D.person.sql, shown = null, hits = [];
  const say = (html, error = false) => { statusEl.innerHTML = html; statusEl.classList.toggle("error", error); };
  const renderHits = rows => {
    hits = rows;
    hitsEl.innerHTML = rows.length ? rows.map((p, i) => `<li><button type="button" data-hit="${i}" aria-pressed="${shown && p.artist_id === shown.artist_id}">` +
      `<span>${esc(cleanName(p.name))}</span><span class="glue-meta">${fmt(p.credits)} credits</span></button></li>`).join("")
      : `<li class="search-none">Nobody on Discogs has that in their name.</li>`;
  };
  const decadeLabel = d => (d >= 2000 ? `${d}s` : `’${String(d).slice(2)}s`);
  const renderPerson = (rows, who) => {
    shown = who;
    hitsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(hits[b.dataset.hit] && hits[b.dataset.hit].artist_id === who.artist_id)));
    const sum = (key, filter = () => true) => {
      const m = new Map();
      rows.filter(filter).forEach(r => m.set(r[key], (m.get(r[key]) || 0) + Number(r.credits)));
      return m;
    };
    const total = rows.reduce((a, r) => a + Number(r.credits), 0);
    const roles = [...sum("role")].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const byDecade = sum("decade", r => r.decade >= 1900 && r.decade <= 2020);
    const undated = total - [...byDecade.values()].reduce((a, n) => a + n, 0);
    const ds = [...byDecade.keys()].sort((a, b) => a - b);
    const decades = ds.length ? Array.from({ length: (ds[ds.length - 1] - ds[0]) / 10 + 1 }, (_, i) => ds[0] + 10 * i) : [];
    const peak = Math.max(1, ...byDecade.values());
    const busiest = decades.reduce((b, d) => ((byDecade.get(d) || 0) > (byDecade.get(b) || 0) ? d : b), decades[0]);
    const mine = [...new Set(rows.flatMap(r => r.on_shelf || []))].map(id => byRelease.get(id)).filter(Boolean);
    const titles = mine.map(r => `<i>${esc(r.title)}</i>`);
    const list = titles.length > 1 ? `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}` : titles.join("");
    personEl.innerHTML = `<p><a class="glue-name" href="https://www.discogs.com/artist/${who.artist_id}">${esc(cleanName(who.name))}</a></p>` +
      `<p class="glue-meta">${fmt(total)} credits · mostly ${esc(roles.map(([r, n]) => `${r} (${fmt(n)})`).join(", "))}</p>` +
      (decades.length ? `<div class="decades" role="img" aria-label="Credits by decade: ${decades.map(d => `${d}s ${fmt(byDecade.get(d) || 0)}`).join(", ")}">` +
        decades.map(d => `<div class="decade" data-d="${d}"><div class="decade-bar"><i style="height:${(100 * (byDecade.get(d) || 0)) / peak}%"></i></div>` +
          `<span>${decadeLabel(d)}</span></div>`).join("") + `</div>` +
        `<p class="glue-meta">Busiest in the ${busiest}s, with ${fmt(byDecade.get(busiest))}${undated ? `. Another ${fmt(undated)} have no year` : ""}.</p>` : "") +
      `<p>${mine.length ? `On ${mine.length === 1 ? "one" : mine.length} of my records: ${list}.` : "None of them are on my shelf."}</p>`;
    const chart = personEl.querySelector(".decades");
    if (chart) chart.querySelectorAll(".decade").forEach(col => {
      const d = Number(col.dataset.d);
      col.addEventListener("mouseenter", () => {
        const b = col.getBoundingClientRect(), c = chart.getBoundingClientRect();
        showTip(chart, `<b>${d}s</b><br>${fmt(byDecade.get(d) || 0)} credits`, b.left - c.left + b.width / 2, b.top - c.top + b.height / 2);
      });
      col.addEventListener("mouseleave", hideTip);
    });
  };
  renderHits(D.search.rows);
  const first = D.search.rows.find(p => p.artist_id === D.person.params.artist_id);
  if (first) renderPerson(D.person.rows, first);
  // Search only works live, so say how it'll connect until the first search runs
  let searched = false;
  const idle = () => {
    if (searched) return;
    const built = `This is the search for “${esc(D.search.params.name)}” from when the page was built.`;
    const on = window.LIVE && window.LIVE.connected();
    const pub = document.documentElement.classList.contains("has-public");
    say(on ? `${built} You're connected, so type a name and it searches live.`
      : pub ? `${built} Searching runs live: type a name and the page connects to my ClickHouse Cloud, nothing to set up. If nobody's used it for a while, the first search takes a few seconds while it wakes up.`
      : `${built} Searching runs live, so press Run live at the top and connect a ClickHouse first.`);
  };
  idle();
  // After a failed search, connecting somewhere else runs it again there
  if (window.LIVE) window.LIVE.onChange(on => (on && statusEl.classList.contains("error") ? search() : idle()));
  const why = err => (/UNKNOWN_TABLE|Unknown table/i.test(err.message) && /people/.test(err.message)
    ? "This ClickHouse has no discogs.people table yet. sql/graph.sql builds it (see the README)."
    : err.message.slice(0, 300));

  // Every live run rewrites the status, so an old error never sits above new results
  let statSearch = "", statPerson = "";
  const showStats = () => say(`<b class="live-dot">live</b> from ClickHouse: ${[statSearch, statPerson].filter(Boolean).join(" · ")}`);
  const secs = r => `${r.elapsed_s.toFixed(3)} s`;

  let seq = 0, pseq = 0, pending;
  const live = (sql, params) => {
    if (!window.LIVE) throw new Error("Live mode isn't loaded on this page.");
    return window.LIVE.query(sql, params);
  };
  async function person(who) {
    D.person.params.artist_id = who.artist_id;
    const my = ++pseq;
    personEl.classList.add("loading");
    try {
      const r = await live(personSql, { artist_id: who.artist_id });
      if (my === pseq) {
        renderPerson(r.rows, who);
        statPerson = `${esc(cleanName(who.name))}'s credits in ${secs(r)}`;
        showStats();
      }
    } catch (err) { if (my === pseq) say(esc(why(err)), true); }
    finally { if (my === pseq) personEl.classList.remove("loading"); }
  }
  function search(prefer) {
    const term = input.value.trim();
    D.search.params.name = term;
    clearTimeout(pending);
    searched = true;
    if (term.length < 3) { say("Type at least three letters."); return; }
    const my = ++seq;
    pending = setTimeout(async () => {
      say("asking ClickHouse…");
      const slow = setTimeout(() => { if (my === seq) say("Still asking. If nobody's used it for a while it has to wake up, which can take up to half a minute."); }, 2500);
      try {
        const r = await live(searchSql, { name: term });
        if (my !== seq) return;
        statSearch = `${fmt(r.rows_read)} names read in ${secs(r)}`;
        statPerson = "";
        showStats();
        renderHits(r.rows);
        const pick = r.rows.find(p => p.artist_id === prefer) || r.rows[0];
        if (pick) person(pick); else { shown = null; personEl.innerHTML = ""; }
      } catch (err) { if (my === seq) say(esc(why(err)), true); }
      finally { clearTimeout(slow); }
    }, 300);
  }
  input.addEventListener("input", () => search());
  hitsEl.addEventListener("click", ev => {
    const b = ev.target.closest("button[data-hit]");
    if (b) person(hits[b.dataset.hit]);
  });
  // A few of C1's people, so the two sections connect
  const presets = document.getElementById("search-presets");
  const seen = new Set();
  presets.innerHTML = D.glue.rows.filter(g => !seen.has(g.artist_id) && seen.add(g.artist_id)).slice(0, 4).map(g =>
    `<button type="button" data-id="${g.artist_id}" data-name="${esc(cleanName(g.person))}">${esc(cleanName(g.person))}</button>`).join("");
  presets.addEventListener("click", ev => {
    const b = ev.target.closest("button[data-id]");
    if (!b) return;
    input.value = b.dataset.name;
    search(Number(b.dataset.id));
  });

  // Live from the SQL panels: an edit or a Try keeps driving the search until it's put back
  onLive("search", (rows, sql) => {
    const why = rows.length ? missing(rows, ["artist_id", "name", "credits"]) : "";
    if (why) return why;
    searched = true;
    searchSql = sql;
    renderHits(rows);
    statSearch = `the search, from its SQL panel${sql.trim() !== D.search.sql.trim() ? " with your edit" : ""}`;
    statPerson = "";
    showStats();
    return true;
  });
  onLive("person", (rows, sql) => {
    const why = missing(rows, ["role", "decade", "credits", "on_shelf"]);
    if (why) return why;
    personSql = sql;
    if (shown) renderPerson(rows, shown);
    statPerson = `${shown ? `${esc(cleanName(shown.name))}'s credits` : "the credits"}, from the SQL panel${sql.trim() !== D.person.sql.trim() ? " with your edit" : ""}`;
    showStats();
    return true;
  });

  queries(D);
  aiPanels(D);
})();
