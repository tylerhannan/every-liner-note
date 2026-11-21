#!/usr/bin/env python3
"""Run the page's queries against local ClickHouse and write web/data/*.js for the static site.

    python3 -I web/build.py          # queries only, reusing the AI output already in data/ai/
    python3 -I web/build.py --ai     # first run the AI functions (colours, people notes) through local Ollama

The AI functions run once per dump at build time. The page only ever reads what they wrote.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

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
    return subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=ROOT).stdout


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
    write_people_notes()


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


def write_people_notes():
    # People notes: the facts for each glue person, then aiGenerate on each
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
    with open(os.path.join(AI_DIR, "people_facts.jsonl"), "w", encoding="utf-8") as f:
        for g in glue:
            recs = "; ".join(f'"{titles[i]["title"]}" by {titles[i]["artist"]}, as {", ".join(SAY.get(r, r) for r in roles.get((g["artist_id"], i), []))}'
                             for i in g["records"] if i in titles)
            facts = (f"{g['person']} is credited on these records: {recs}. "
                     f"Across Discogs they are credited on {g['works_overall']:,} records in total, in all sorts of roles.")
            f.write(json.dumps({"artist_id": g["artist_id"], "facts": facts}, ensure_ascii=False) + "\n")
    notes = ch(["--format", "TSV", "--queries-file", os.path.join(ROOT, "sql", "ai", "people_notes.sql")], AI_STORE)
    open(os.path.join(AI_DIR, "people_notes.tsv"), "w", encoding="utf-8").write(notes)
    print(f"ai: {len(notes.splitlines())} people notes", file=sys.stderr)


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
    path = os.path.join(AI_DIR, "people_notes.tsv")
    if not os.path.exists(path):
        return {}
    out = {}
    for line in open(path, encoding="utf-8"):
        if "\t" in line:
            k, v = line.rstrip("\n").split("\t", 1)
            out[k] = v.replace("\\n", " ").replace("\\'", "'").strip()
    return out


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


def main():
    if "--ai" in sys.argv:
        run_ai()
    load_ai_tables()
    os.makedirs(os.path.join(ROOT, "web", "data"), exist_ok=True)
    for act, queries in ACTS.items():
        data = {}
        for q in queries:
            name, file, params = q if isinstance(q, tuple) else (q, q, None)
            data[name] = run(os.path.join(ROOT, "sql", act, f"{file}.sql"), params)
        if act == "act1":
            data["dates"] = dates()
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
