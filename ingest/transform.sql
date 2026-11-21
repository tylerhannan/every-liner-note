-- discogskit Parquet -> MergeTree. load.sh swaps __DIR__ for the dump's Parquet folder.
-- Credits without an artist ID (names Discogs never linked) can't be graph edges, so they're left out.

INSERT INTO discogs.labels
SELECT id, ifNull(name, ''), ifNull(profile, ''), ifNull(parent_label_id, 0), ifNull(data_quality, '')
FROM file('__DIR__/labels/labels.parquet');

INSERT INTO discogs.artists
SELECT id, ifNull(name, ''), ifNull(realname, ''), ifNull(profile, ''), ifNull(data_quality, ''),
       arrayFilter(x -> x != '', arrayMap(x -> ifNull(x, ''), namevariations))
FROM file('__DIR__/artists/artists.parquet');

INSERT INTO discogs.artist_links
SELECT artist_id, member_id, ifNull(name, ''), 'member' FROM file('__DIR__/artists/artist_members.parquet') WHERE member_id IS NOT NULL
UNION ALL
SELECT artist_id, group_id, ifNull(name, ''), 'group' FROM file('__DIR__/artists/artist_groups.parquet') WHERE group_id IS NOT NULL
UNION ALL
SELECT artist_id, alias_id, ifNull(name, ''), 'alias' FROM file('__DIR__/artists/artist_aliases.parquet') WHERE alias_id IS NOT NULL;

INSERT INTO discogs.masters
SELECT m.id, ifNull(m.main_release, 0), ifNull(m.title, ''), ifNull(m.year, 0),
       arrayMap(x -> ifNull(x, ''), m.genres), arrayMap(x -> ifNull(x, ''), m.styles),
       a.ids, a.names, ifNull(m.data_quality, '')
FROM file('__DIR__/masters/masters.parquet') AS m
LEFT JOIN
(
    SELECT master_id, groupArray(assumeNotNull(artist_id)) AS ids, groupArray(ifNull(name, '')) AS names
    FROM file('__DIR__/masters/master_artists.parquet')
    WHERE artist_id IS NOT NULL
    GROUP BY master_id
) AS a ON a.master_id = m.id;

INSERT INTO discogs.releases
SELECT r.id, ifNull(r.master_id, 0), ifNull(r.is_main_release, false), ifNull(r.status, ''),
       ifNull(r.title, ''), ifNull(r.country, ''), ifNull(r.released, ''), toUInt16OrZero(substring(ifNull(r.released, ''), 1, 4)),
       arrayMap(x -> ifNull(x, ''), r.genres), arrayMap(x -> ifNull(x, ''), r.styles),
       f.formats, f.descriptions, a.ids, a.names, ifNull(r.notes, ''), ifNull(r.data_quality, '')
FROM file('__DIR__/releases/releases.parquet') AS r
LEFT JOIN
(
    SELECT release_id, groupArray(ifNull(name, '')) AS formats,
           arrayDistinct(arrayMap(x -> ifNull(x, ''), arrayFlatten(groupArray(descriptions)))) AS descriptions
    FROM file('__DIR__/releases/release_formats.parquet')
    GROUP BY release_id
) AS f ON f.release_id = r.id
LEFT JOIN
(
    SELECT release_id, groupArray(assumeNotNull(artist_id)) AS ids, groupArray(ifNull(name, '')) AS names
    FROM file('__DIR__/releases/release_artists.parquet')
    WHERE artist_id IS NOT NULL
    GROUP BY release_id
) AS a ON a.release_id = r.id;

-- "Bass [Electric, Fretless], Producer" becomes two rows; RE2 has no lookahead, so match roles rather than split on commas
INSERT INTO discogs.credits
SELECT c.release_id, r.master_id, c.artist_id, c.name, c.anv,
       trimBoth(extract(part, '^[^\\[]*')) AS role, extract(part, '\\[(.*)\\]') AS role_detail,
       c.scope, c.position, c.is_sub_track
FROM
(
    SELECT release_id, assumeNotNull(artist_id) AS artist_id, ifNull(name, '') AS name, ifNull(anv, '') AS anv,
           '' AS role, 'release_main' AS scope, '' AS position, false AS is_sub_track
    FROM file('__DIR__/releases/release_artists.parquet') WHERE artist_id IS NOT NULL
    UNION ALL
    SELECT release_id, assumeNotNull(artist_id), ifNull(name, ''), ifNull(anv, ''), ifNull(role, ''), 'release_extra', '', false
    FROM file('__DIR__/releases/release_extraartists.parquet') WHERE artist_id IS NOT NULL
    UNION ALL
    SELECT a.release_id, assumeNotNull(a.artist_id), ifNull(a.name, ''), ifNull(a.anv, ''), '', 'track_main',
           ifNull(t.position, ''), t.parent_idx IS NOT NULL
    FROM file('__DIR__/releases/release_track_artists.parquet') AS a
    JOIN file('__DIR__/releases/release_tracks.parquet') AS t ON t.release_id = a.release_id AND t.track_idx = a.track_idx
    WHERE a.artist_id IS NOT NULL
    UNION ALL
    SELECT a.release_id, assumeNotNull(a.artist_id), ifNull(a.name, ''), ifNull(a.anv, ''), ifNull(a.role, ''), 'track_extra',
           ifNull(t.position, ''), t.parent_idx IS NOT NULL
    FROM file('__DIR__/releases/release_track_extraartists.parquet') AS a
    JOIN file('__DIR__/releases/release_tracks.parquet') AS t ON t.release_id = a.release_id AND t.track_idx = a.track_idx
    WHERE a.artist_id IS NOT NULL
) AS c
ARRAY JOIN if(c.role = '', [''], extractAll(c.role, '[^,\\[]+(?:\\[[^\\]]*\\])?')) AS part
JOIN (SELECT release_id, master_id FROM discogs.releases) AS r ON r.release_id = c.release_id;

INSERT INTO discogs.release_labels
SELECT l.release_id, r.master_id, ifNull(l.label_id, 0), ifNull(l.name, ''), ifNull(l.catno, ''), 'label', ''
FROM file('__DIR__/releases/release_labels.parquet') AS l
JOIN (SELECT release_id, master_id FROM discogs.releases) AS r ON r.release_id = l.release_id
UNION ALL
SELECT c.release_id, r.master_id, ifNull(c.company_id, 0), ifNull(c.name, ''), ifNull(c.catno, ''), 'company', ifNull(c.entity_type_name, '')
FROM file('__DIR__/releases/release_companies.parquet') AS c
JOIN (SELECT release_id, master_id FROM discogs.releases) AS r ON r.release_id = c.release_id;

INSERT INTO discogs.release_identifiers
SELECT release_id, ifNull(type, ''), ifNull(description, ''), ifNull(value, '')
FROM file('__DIR__/releases/release_identifiers.parquet');

INSERT INTO discogs.release_tracks
SELECT release_id, track_idx, ifNull(parent_idx, -1), ifNull(position, ''), ifNull(title, ''),
       -- "1:02:03" or "4:45" to seconds; anything unparseable becomes 0
       toUInt32(arrayFold((acc, x) -> acc * 60 + toUInt64OrZero(x), splitByChar(':', ifNull(duration, '')), toUInt64(0)))
FROM file('__DIR__/releases/release_tracks.parquet');

INSERT INTO discogs.release_formats
SELECT release_id, ifNull(name, ''), ifNull(qty, ''), ifNull(trim(text), ''), arrayMap(x -> ifNull(x, ''), descriptions)
FROM file('__DIR__/releases/release_formats.parquet');
