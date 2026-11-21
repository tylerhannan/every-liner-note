#!/usr/bin/env python3
"""Run the page's queries against local ClickHouse and write web/data/*.js for the static site.

    python3 -I web/build.py          # queries only, reusing the AI output already in data/ai/
    python3 -I web/build.py --ai     # first run the AI functions (colours, people notes) through local Ollama

The AI functions run once per dump at build time. The page only ever reads what they wrote.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.environ.get("CH_LOCAL_PATH", os.path.join(ROOT, "data", "chlocal"))
AI_DIR = os.path.join(ROOT, "data", "ai")
# Separate store for AI calls, so a slow model run never holds the main database
AI_STORE = os.environ.get("CH_AI_PATH", os.path.join(ROOT, "data", "aistore"))

ACTS = {
    "act1": ["records", "summary", "genres"],
    "act2": ["revival_by_age", "reissue_check", "shelf", "colours", "colour_stats", "shelf_colours"],
    "act3": ["glue", "next"],
    "act4": ["runtime", ("fit", "fit", {"minutes": 60})],
}


def ch(args, store=STORE):
    cmd = ["clickhouse", "local", "--path", store, "--output_format_json_quote_64bit_integers", "0", *args]
    # No stdin: clickhouse local reads a piped stdin as input data and fails
    return subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=ROOT, stdin=subprocess.DEVNULL).stdout


def run(sql_path, params=None):
    sql = open(sql_path, encoding="utf-8").read().strip().rstrip(";")
    args = ["--format", "JSON", "--query", sql] + [f"--param_{k}={v}" for k, v in (params or {}).items()]
    res = json.loads(ch(args))
    stats = res.get("statistics", {})
    # The page shows the query and what it cost, so keep both alongside the rows
    return {"rows": res["data"], "sql": sql, "params": params or {},
            "elapsed_s": round(stats.get("elapsed", 0), 3), "rows_read": stats.get("rows_read", 0)}


def ai_store():
    os.makedirs(AI_DIR, exist_ok=True)
    if not os.path.isdir(AI_STORE):
        ch(["--query", "CREATE NAMED COLLECTION IF NOT EXISTS ollama_text AS provider = 'openai', "
                       "endpoint = 'http://localhost:11434/v1/chat/completions', model = 'gemma3:4b'"], AI_STORE)


def run_ai():
    ai_store()
    classify_colours(fresh="--fresh" in sys.argv)
    write_people_notes(fresh="--fresh" in sys.argv)


def classify_colours(fresh=False):
    # The distinct phrases worth classifying: the most common on limited vinyl, plus every phrase on my shelf.
    # Phrases already classified are kept, so a new shelf only costs a call per new phrase. --fresh redoes them all.
    out = os.path.join(AI_DIR, "colours.tsv")
    done = set()
    if os.path.exists(out) and not fresh:
        done = {line.split("\t", 1)[0] for line in open(out, encoding="utf-8") if "\t" in line}
    phrases = ch(["--format", "TSV", "--query", """
        WITH ltd AS (
            SELECT lower(f.text) AS phrase, count() AS n FROM discogs.release_formats AS f JOIN discogs.releases AS r ON r.release_id = f.release_id
            WHERE f.name = 'Vinyl' AND has(f.descriptions, 'Limited Edition') AND r.year >= 2015 AND f.text != ''
            GROUP BY phrase ORDER BY n DESC LIMIT 2000),
        mine AS (SELECT DISTINCT lower(text) AS phrase FROM discogs.release_formats
                 WHERE release_id IN (SELECT release_id FROM discogs.shelf) AND name = 'Vinyl' AND text != '')
        SELECT phrase FROM ltd UNION DISTINCT SELECT phrase FROM mine"""])
    todo = [p for p in phrases.splitlines() if p and p not in done]
    print(f"ai: {len(todo)} new colour phrases to classify", file=sys.stderr)
    if not todo:
        return
    open(os.path.join(AI_DIR, "colour_phrases.tsv"), "w", encoding="utf-8").write("\n".join(todo) + "\n")
    colours = ch(["--format", "TSV", "--queries-file", os.path.join(ROOT, "sql", "ai", "colours.sql")], AI_STORE)
    with open(out, "w" if fresh or not done else "a", encoding="utf-8") as f:
        f.write(colours)


def people_facts():
    # The facts for each glue person, sorted so the same credits always give the same text
    glue = run(os.path.join(ROOT, "sql", "act3", "glue.sql"))["rows"]
    titles = {r["release_id"]: r for r in run(os.path.join(ROOT, "sql", "act1", "records.sql"))["rows"]}
    # Roles record by record, so the model never has to guess which role went with which record
    ids = ",".join(str(g["artist_id"]) for g in glue) or "0"
    per = json.loads(ch(["--format", "JSON", "--query", f"""
        SELECT artist_id, release_id, groupUniqArray(role) AS roles FROM discogs.credits
        WHERE artist_id IN ({ids}) AND release_id IN (SELECT release_id FROM discogs.shelf) AND role != ''
        GROUP BY artist_id, release_id"""]))["data"]
    roles = {(r["artist_id"], r["release_id"]): r["roles"] for r in per}
    # A small model reads Written-By as "wrote the album"; it means a song on it
    SAY = {"Written-By": "Written-By (a songwriting credit for a song on it)"}
    facts = {}
    for g in glue:
        recs = "; ".join(f'"{titles[i]["title"]}" by {titles[i]["artist"]}, as {", ".join(SAY.get(r, r) for r in sorted(roles.get((g["artist_id"], i), [])))}'
                         for i in sorted(g["records"]) if i in titles)
        facts[str(g["artist_id"])] = (f"{g['person']} is credited on these records: {recs}. "
                                      f"Across Discogs they are credited on {g['works_overall']:,} records in total, in all sorts of roles.")
    return facts


def write_people_notes(fresh=False):
    # People notes: aiGenerate only for people whose facts or prompt changed since the last run
    facts = people_facts()
    sql_path = os.path.join(ROOT, "sql", "ai", "people_notes.sql")
    prompt = open(sql_path, encoding="utf-8").read()
    key = lambda f: hashlib.sha1(f"{prompt}\n{f}".encode()).hexdigest()[:12]
    out = os.path.join(AI_DIR, "people_notes.tsv")
    cached = {} if fresh else {k: (h, n) for k, h, n in note_rows(out)}
    todo = [k for k, f in facts.items() if cached.get(k, ("",))[0] != key(f)]
    print(f"ai: {len(todo)} people notes to write, {len(facts) - len(todo)} unchanged", file=sys.stderr)
    new = {}
    if todo:
        with open(os.path.join(AI_DIR, "people_facts.jsonl"), "w", encoding="utf-8") as f:
            for k in todo:
                f.write(json.dumps({"artist_id": int(k), "facts": facts[k]}, ensure_ascii=False) + "\n")
        for line in ch(["--format", "TSV", "--queries-file", sql_path], AI_STORE).splitlines():
            if "\t" in line:
                k, n = line.split("\t", 1)
                new[k] = n
    # Notes stay as ClickHouse wrote them (TSV-escaped), one row per person on the page: id, key, note
    with open(out, "w", encoding="utf-8") as f:
        for k, fact in facts.items():
            n = new.get(k, cached.get(k, ("", ""))[1])
            if n:
                f.write(f"{k}\t{key(fact)}\t{n}\n")


def note_rows(path):
    if not os.path.exists(path):
        return []
    rows = []
    for line in open(path, encoding="utf-8"):
        parts = line.rstrip("\n").split("\t", 2)
        if len(parts) == 3:
            rows.append(tuple(parts))
        elif len(parts) == 2:  # written before notes had a key, so they get rewritten once
            rows.append((parts[0], "", parts[1]))
    return rows


def load_ai_tables():
    path = os.path.join(AI_DIR, "colours.tsv")
    if os.path.exists(path):
        ch(["--multiquery", "--query", f"""
            CREATE TABLE IF NOT EXISTS discogs.vinyl_colours (phrase String, colour LowCardinality(String)) ENGINE = MergeTree ORDER BY phrase;
            TRUNCATE TABLE discogs.vinyl_colours;
            -- The model calls anything that isn't a colour ("180g", "1st pressing") black, so black has to be said out loud
            INSERT INTO discogs.vinyl_colours
            -- and "purple labels" is the label's colour, not the vinyl's
            SELECT phrase, multiIf(colour = 'black' AND NOT match(phrase, 'black|noir|schwarz|zwart|nero|negro|onyx|jet|ebony|obsidian|coal|midnight'), 'not a colour',
                                   match(phrase, 'label') AND NOT match(phrase, 'vinyl|wax|disc|record'), 'not a colour',
                                   colour)
            FROM file('{path}', TSV, 'phrase String, colour String')"""])


def people_notes():
    return {k: n.replace("\\n", " ").replace("\\'", "'").strip() for k, _, n in note_rows(os.path.join(AI_DIR, "people_notes.tsv"))}


def dates():
    """When this was built, which Discogs dump is loaded, and the date on the shelf export (from its file name)."""
    import datetime, glob
    def nice(d): return f"{d.day} {d:%B %Y}"
    out = {"built": nice(datetime.date.today())}
    dumps = sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "data", "pq", "[0-9]" * 8)))
    if dumps:
        out["dump"] = nice(datetime.datetime.strptime(dumps[-1], "%Y%m%d").date())
    exports = sorted(glob.glob(os.path.join(ROOT, "*collection*.csv")) + glob.glob(os.path.join(ROOT, "*collection*.zip")), key=os.path.getmtime)
    if exports:
        m = re.search(r"(\d{8})", os.path.basename(exports[-1]))
        out["shelf"] = nice(datetime.datetime.strptime(m.group(1), "%Y%m%d").date()) if m else None
    return out


COVERS = os.path.join(ROOT, "data", "covers.tsv")
MB_UA = "every-liner-note/1.0 (https://github.com/tylerhannan/every-liner-note)"


def mb(path):
    req = urllib.request.Request(f"https://musicbrainz.org/ws/2/{path}", headers={"User-Agent": MB_UA, "Accept": "application/json"})
    for attempt in range(4):
        time.sleep(1.1 + 3 * attempt)  # MusicBrainz asks for one request a second, and says 503 when you go faster
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 503 or attempt == 3:
                raise


def has_front(kind, mbid):
    req = urllib.request.Request(f"https://coverartarchive.org/{kind}/{mbid}/front-250", method="HEAD", headers={"User-Agent": MB_UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False


def linked(discogs_url, kind):
    # The MusicBrainz entries that link to this Discogs page. The URL says release-group, the JSON says release_group.
    key = kind.replace("-", "_")
    try:
        d = mb(f"url?resource={urllib.parse.quote(discogs_url, safe='')}&inc={kind}-rels&fmt=json")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    return [r[key]["id"] for r in d.get("relations", []) if r.get("target-type") == key]


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(\d+\)", "", s).replace("&", "and")  # Discogs' "(2)" suffixes
    return re.sub(r"[^a-z0-9]", "", s)


def searched(artist, title, year):
    # Albums nobody has linked to Discogs yet. Only a same-title, same-artist, same-year match counts,
    # since the top search hit for "Wicked: For Good" is a piano cover album.
    words = re.sub(r"[^\w\s]", " ", title).split()
    d = mb("release-group/?query=" + urllib.parse.quote("releasegroup:(" + " ".join(words) + ")") + "&limit=15&fmt=json")
    a = norm(artist)
    for g in d.get("release-groups", []):
        credit = [c for c in g.get("artist-credit", []) if isinstance(c, dict)]
        names = [norm(c.get("name", "")) for c in credit]
        joined = norm("".join(c.get("name", "") + c.get("joinphrase", "") for c in credit))
        artist_ok = ("variousartists" in names) if a == "various" else (a == joined or a in names or (names and a.startswith(names[0])))
        y = int((g.get("first-release-date") or "0")[:4] or 0)
        if norm(g["title"]) == norm(title) and artist_ok and (not year or abs(y - year) <= 1):
            yield g["id"]


def find_cover(r):
    for mbid in linked(f"https://www.discogs.com/release/{r['release_id']}", "release"):
        if has_front("release", mbid):
            return "release", mbid
    if r["master_id"]:
        for mbid in linked(f"https://www.discogs.com/master/{r['master_id']}", "release-group"):
            if has_front("release-group", mbid):
                return "release-group", mbid
    for mbid in searched(r["artist"], r["title"], r["year"]):
        if has_front("release-group", mbid):
            return "release-group", mbid
    return "", ""


def find_covers():
    # Covers from the Cover Art Archive: my exact pressing if it has one, otherwise the album. Looked up once per record
    # and kept in data/covers.tsv; a record with no cover gets another look after a month.
    cache = {}
    if os.path.exists(COVERS):
        for line in open(COVERS, encoding="utf-8"):
            p = line.rstrip("\n").split("\t")
            if len(p) == 4:
                cache[p[0]] = p[1:]
    shelf = json.loads(ch(["--format", "JSON", "--query", """
        SELECT s.release_id AS release_id, r.master_id AS master_id, s.artist AS artist, trim(s.title) AS title,
               if(m.year > 0, m.year, r.year) AS year
        FROM discogs.shelf AS s JOIN discogs.releases AS r ON r.release_id = s.release_id
        LEFT JOIN discogs.masters AS m ON m.master_id = r.master_id AND r.master_id != 0"""]))["data"]
    today = datetime.date.today()
    due = lambda c: c is None or (not c[1] and (today - datetime.date.fromisoformat(c[2])).days > 30)
    todo = [r for r in shelf if due(cache.get(str(r["release_id"])))]
    if todo:
        print(f"covers: looking up {len(todo)} records on MusicBrainz, a second or two each", file=sys.stderr)
    for r in todo:
        try:
            kind, mbid = find_cover(r)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            print(f"covers: MusicBrainz didn't answer ({e}), so keeping what's cached", file=sys.stderr)
            break
        cache[str(r["release_id"])] = [kind, mbid, today.isoformat()]
    ids = {str(r["release_id"]) for r in shelf}
    with open(COVERS, "w", encoding="utf-8") as f:
        f.write("".join(f"{k}\t{v[0]}\t{v[1]}\t{v[2]}\n" for k, v in sorted(cache.items()) if k in ids))
    found = {k: f"{v[0]}/{v[1]}" for k, v in cache.items() if v[1] and k in ids}
    print(f"covers: {len(found)} of {len(shelf)} records have one on the Cover Art Archive", file=sys.stderr)
    return found


def main():
    if "--ai" in sys.argv:
        run_ai()
    load_ai_tables()
    covers = find_covers()
    # Which of my records are coloured vinyl, for the record that slides out of each sleeve
    vinyl = {}
    for r in run(os.path.join(ROOT, "sql", "act2", "shelf_colours.sql"))["rows"]:
        vinyl.setdefault(str(r["release_id"]), r["colour"])
    os.makedirs(os.path.join(ROOT, "web", "data"), exist_ok=True)
    for act, queries in ACTS.items():
        data = {}
        for q in queries:
            name, file, params = q if isinstance(q, tuple) else (q, q, None)
            data[name] = run(os.path.join(ROOT, "sql", act, f"{file}.sql"), params)
        if act == "act1":
            data["dates"] = dates()
            data["covers"] = covers
            data["vinyl"] = vinyl
        if act == "act3":
            data["notes"] = people_notes()
            data["notes_sql"] = open(os.path.join(ROOT, "sql", "ai", "people_notes.sql"), encoding="utf-8").read().strip()
        if act == "act2":
            data["colours_ai_sql"] = open(os.path.join(ROOT, "sql", "ai", "colours.sql"), encoding="utf-8").read().strip()
        # A .js file rather than .json, so the page also works opened straight from disk
        with open(os.path.join(ROOT, "web", "data", f"{act}.js"), "w", encoding="utf-8") as f:
            f.write(f"window.{act.upper()} = " + json.dumps(data, ensure_ascii=False) + ";\n")
        for k, v in data.items():
            if isinstance(v, dict) and "rows" in v:
                print(f"{act}.{k}: {len(v['rows'])} rows, read {v['rows_read']:,} rows in {v['elapsed_s']}s", file=sys.stderr)


if __name__ == "__main__":
    main()
