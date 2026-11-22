-- Asks: What fits the time available? The combination of up to four records on the shelf that fills the minutes given
--   best without going over, with the fewest records on a tie.
-- How: The running times go into one array through a scalar subquery, which ClickHouse runs once and reuses, where a CTE
--   would be recomputed every time it's referenced. numbers() gives each record an index, and self-joins on a.i < b.i list
--   every set of one to four records exactly once. arraySum adds up each set, and ORDER BY total DESC, length(ids) ASC
--   picks the fullest.
-- Try: length(ids) ASC => length(ids) DESC | On a tie, the most records instead of the fewest.
WITH
shelf AS (SELECT s.release_id, r.master_id, trim(s.title) AS title, s.artist FROM discogs.shelf AS s JOIN (SELECT release_id, master_id FROM discogs.releases WHERE release_id IN (SELECT release_id FROM discogs.shelf)) AS r ON r.release_id = s.release_id),
-- Every pressing of the shelf's albums, plus the shelf's own pressings, with the album each belongs to
pressings AS (SELECT release_id, master_id FROM discogs.releases WHERE master_id IN (SELECT master_id FROM shelf WHERE master_id != 0) OR release_id IN (SELECT release_id FROM discogs.shelf)),
-- One pass over release_tracks: each fully timed pressing's total, grouped by album into the album's median and a map
-- from pressing to total, so a record can use its own timing or fall back to its album's
album AS
(
    SELECT p.master_id AS master_id, quantileExact(0.5)(t.total_s) AS median_s, mapFromArrays(groupArray(t.release_id), groupArray(t.total_s)) AS totals
    FROM
    (
        SELECT release_id, sum(seconds) AS total_s
        FROM discogs.release_tracks
        WHERE parent_idx = -1 AND release_id IN (SELECT release_id FROM pressings)
        GROUP BY release_id
        HAVING min(seconds) > 0
    ) AS t
    JOIN pressings AS p ON p.release_id = t.release_id
    GROUP BY p.master_id
),
records AS
(
    SELECT row_number() OVER (ORDER BY s.release_id) AS i, s.title, s.artist,
           toUInt32(round(if(a.totals[s.release_id] > 0, a.totals[s.release_id], if(s.master_id != 0, a.median_s, 0)) / 60)) AS m
    FROM shelf AS s
    LEFT JOIN album AS a ON a.master_id = s.master_id
    WHERE if(a.totals[s.release_id] > 0, a.totals[s.release_id], if(s.master_id != 0, a.median_s, 0)) > 0
),
-- A scalar subquery runs once and is reused, so the combinations below don't reread 182 million tracks
(SELECT groupArray((m, title, artist)) FROM (SELECT m, title, artist FROM records ORDER BY i)) AS recs,
n AS (SELECT toUInt32(number + 1) AS i FROM numbers(length(recs))),
fits AS
(
    SELECT [a.i] AS ids FROM n AS a
    UNION ALL SELECT [a.i, b.i] FROM n AS a, n AS b WHERE a.i < b.i
    UNION ALL SELECT [a.i, b.i, c.i] FROM n AS a, n AS b, n AS c WHERE a.i < b.i AND b.i < c.i
    UNION ALL SELECT [a.i, b.i, c.i, d.i] FROM n AS a, n AS b, n AS c, n AS d WHERE a.i < b.i AND b.i < c.i AND c.i < d.i
),
scored AS (SELECT ids, arraySum(arrayMap(i -> recs[i].1, ids)) AS total FROM fits WHERE total <= {minutes:UInt32})
SELECT total, {minutes:UInt32} - total AS spare,
       arrayMap(i -> recs[i].2, ids) AS titles,
       arrayMap(i -> recs[i].3, ids) AS artists,
       arrayMap(i -> recs[i].1, ids) AS record_minutes,
       (SELECT count() FROM scored) AS combinations_that_fit
FROM scored
ORDER BY total DESC, length(ids) ASC
LIMIT 1
