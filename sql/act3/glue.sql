-- Asks: Who keeps turning up? People credited on pressings in the shelf table by two or more different artists.
-- How: Reads the credits for the pressings in the shelf table through the by_release projection, a copy of the credits
--   table sorted by release, so it skips almost all of the table. Each pressing's sorted list of artists is its family.
--   uniqExact counts the families each person is credited on, groupUniqArray collects their records and roles, and HAVING
--   keeps anyone with two or more. A NOT IN over arrayJoin(artist_ids) drops the main artists, and a join to the role map
--   drops credits that aren't making the music (artwork, mastering, and, yes, liner notes).
-- Try: HAVING families >= 2 => HAVING families >= 3 | Only people credited across three or more artist families.
-- Try: LIMIT 15 => LIMIT 100 | Everyone who qualifies, not just the top 15.
-- Only the exact pressings on the shelf count, so a reissue's bonus disc can't sneak someone in.
WITH
shelf AS
(
    -- Filtered by releases' primary key rather than joined to the shelf, so each use reads only the shelf's rows
    SELECT release_id, arraySort(artist_names) AS family
    FROM discogs.releases WHERE release_id IN (SELECT release_id FROM discogs.shelf)
),
glue AS
(
    SELECT c.artist_id AS artist_id, any(c.artist_name) AS person,
           uniqExact(sh.family) AS families,
           groupUniqArray(sh.release_id) AS records,
           groupUniqArray(if(c.role_detail != '', concat(c.role, ' (', c.role_detail, ')'), c.role)) AS roles,
           max(m.link = 'strong') AS played_or_produced
    FROM discogs.credits AS c
    JOIN shelf AS sh ON sh.release_id = c.release_id
    LEFT JOIN discogs.role_map AS m ON m.role = c.role
    WHERE c.release_id IN (SELECT release_id FROM discogs.shelf)
      AND c.artist_id NOT IN (194, 355, 151641, 118760, 320156, 967691)
      AND c.role != ''
      AND (m.role = '' OR m.link != 'none')
      -- Main artists of the shelf's own records don't count as glue
      AND c.artist_id NOT IN (SELECT arrayJoin(artist_ids) FROM discogs.releases WHERE release_id IN (SELECT release_id FROM discogs.shelf))
    GROUP BY c.artist_id
    HAVING families >= 2
)
SELECT g.*, d.works_overall
FROM glue AS g
LEFT JOIN (SELECT artist_id, any(person_works) AS works_overall FROM discogs.edges WHERE artist_id IN (SELECT artist_id FROM glue) GROUP BY artist_id) AS d
    ON d.artist_id = g.artist_id
ORDER BY g.played_or_produced DESC, g.families DESC, d.works_overall
LIMIT 15
