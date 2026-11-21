-- How long have you got? Every combination of up to four records on the shelf, and the one that fills {minutes:UInt32}
-- best without going over. Fewest records wins a tie. Running times work the same way as runtime.sql.
WITH
shelf AS (SELECT s.release_id, r.master_id, trim(s.title) AS title, s.artist FROM discogs.shelf AS s JOIN discogs.releases AS r ON r.release_id = s.release_id),
timed AS
(
    SELECT release_id, sum(seconds) AS total_s
    FROM discogs.release_tracks
    WHERE parent_idx = -1
      AND release_id IN (SELECT release_id FROM discogs.releases WHERE master_id IN (SELECT master_id FROM shelf WHERE master_id != 0) OR release_id IN (SELECT release_id FROM shelf))
    GROUP BY release_id
    HAVING min(seconds) > 0
),
album AS
(
    SELECT r.master_id, quantileExact(0.5)(t.total_s) AS median_s
    FROM timed AS t JOIN discogs.releases AS r ON r.release_id = t.release_id
    WHERE r.master_id IN (SELECT master_id FROM shelf WHERE master_id != 0)
    GROUP BY r.master_id
),
records AS
(
    SELECT row_number() OVER (ORDER BY s.release_id) AS i, s.title, s.artist,
           toUInt32(round(if(own.total_s > 0, own.total_s, a.median_s) / 60)) AS m
    FROM shelf AS s
    LEFT JOIN timed AS own ON own.release_id = s.release_id
    LEFT JOIN album AS a ON a.master_id = s.master_id
    WHERE if(own.total_s > 0, own.total_s, a.median_s) > 0
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
