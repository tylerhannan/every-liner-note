-- The graph for six degrees: people <-> works. A work is a master, or a release that has no master.
-- Rebuild after every monthly load, after ingest/load_role_map.sh.

CREATE OR REPLACE TABLE discogs.works
(
    work UInt32,
    title String,
    year UInt16,
    artist_names Array(String),
    release_id UInt32,
    -- Various-artists records and compilations: real links, but they borrow credits from the original recordings
    is_comp Bool
)
ENGINE = MergeTree
ORDER BY work;

INSERT INTO discogs.works
SELECT m.master_id, m.title, m.year, m.artist_names, m.main_release_id,
       has(m.artist_names, 'Various') OR has(r.format_descriptions, 'Compilation')
FROM discogs.masters AS m LEFT JOIN discogs.releases AS r ON r.release_id = m.main_release_id
UNION ALL
-- Releases without a master get an offset id so they can't collide with master ids
SELECT 1000000000 + release_id, title, year, artist_names, release_id,
       has(artist_names, 'Various') OR has(format_descriptions, 'Compilation')
FROM discogs.releases WHERE master_id = 0;

CREATE OR REPLACE TABLE discogs.edges
(
    artist_id UInt32,
    work UInt32,
    artist_name String,
    roles Array(LowCardinality(String)),
    -- Played, sang, produced or engineered on it (or is the main artist), rather than only wrote it
    strong Bool,
    person_works UInt32,
    work_people UInt32,
    work_comp Bool,
    PROJECTION by_work (SELECT * ORDER BY work, artist_id)
)
ENGINE = MergeTree
ORDER BY (artist_id, work);

INSERT INTO discogs.edges
WITH base AS
(
    SELECT c.artist_id, if(c.master_id != 0, c.master_id, 1000000000 + c.release_id) AS work,
           any(c.artist_name) AS artist_name, groupUniqArray(c.role) AS roles,
           -- Main artists have no role; roles outside the mapped top 300 count as weak until aiClassify sorts them
           max(if(c.role = '', 'strong', if(m.role = '', 'weak', toString(m.link)))) = 'strong' AS strong
    FROM discogs.credits AS c
    LEFT JOIN discogs.role_map AS m ON m.role = c.role
    -- Placeholders, not people: Various, Unknown Artist, Traditional, No Artist, Folk, Anonymous
    WHERE c.artist_id NOT IN (194, 355, 151641, 118760, 320156, 967691)
      AND (m.role = '' OR m.link != 'none')
    GROUP BY c.artist_id, work
)
SELECT b.artist_id, b.work, b.artist_name, b.roles, b.strong,
       count() OVER (PARTITION BY b.artist_id) AS person_works,
       count() OVER (PARTITION BY b.work) AS work_people,
       w.is_comp AS work_comp
FROM base AS b
LEFT JOIN discogs.works AS w ON w.work = b.work;

-- Vinyl pressings counted by year, by how many years after the album they came out, and by two Discogs tags, for B1.
-- A few thousand rows, so B1 doesn't join every vinyl release to its album each time it runs.
CREATE OR REPLACE TABLE discogs.vinyl_by_age
ENGINE = SummingMergeTree ORDER BY (year, age, tagged, compilation) AS
SELECT r.year AS year, toInt16(r.year - m.year) AS age,
       has(r.format_descriptions, 'Reissue') OR has(r.format_descriptions, 'Repress') AS tagged,
       has(r.format_descriptions, 'Compilation') AS compilation,
       count() AS pressings
FROM discogs.releases AS r
JOIN discogs.masters AS m ON m.master_id = r.master_id
WHERE has(r.formats, 'Vinyl') AND r.year BETWEEN 1955 AND 2026 AND m.year BETWEEN 1900 AND r.year
GROUP BY year, age, tagged, compilation;

-- Everyone credited anywhere, with how many credits they have, for C2's search. Small enough to scan for any part of a name.
CREATE OR REPLACE TABLE discogs.people
ENGINE = MergeTree ORDER BY artist_id AS
SELECT artist_id, any(artist_name) AS name, count() AS credits
FROM discogs.credits
WHERE artist_id NOT IN (194, 355, 151641, 118760, 320156, 967691)
GROUP BY artist_id;
