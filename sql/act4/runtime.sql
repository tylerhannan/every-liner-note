-- Asks: How long does the shelf take to play? Each record's running time, from its own track list, or the median of
--   fully timed pressings of the same album when its own is incomplete.
-- How: release_tracks is sorted by release_id, so an IN filter on every pressing of the shelf's albums skips most of the
--   table, and it gets read once. parent_idx = -1 leaves out sub-tracks, sum(seconds) adds up each pressing, and HAVING
--   min(seconds) > 0 keeps only fully timed ones. Grouping those by album gives quantileExact(0.5), the median used as a
--   fallback, and mapFromArrays, a map from each pressing to its own total.
-- Try: ORDER BY seconds DESC => ORDER BY seconds DESC LIMIT 5 | Only the five longest records.
WITH
shelf AS (SELECT s.release_id, r.master_id, trim(s.title) AS title, s.artist, s.format FROM discogs.shelf AS s JOIN (SELECT release_id, master_id FROM discogs.releases WHERE release_id IN (SELECT release_id FROM discogs.shelf)) AS r ON r.release_id = s.release_id),
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
)
SELECT s.release_id AS release_id, s.artist AS artist, s.title AS title,
       if(match(s.format, '(\d+)xLP'), toUInt32(extract(s.format, '(\d+)xLP')), 1) AS discs,
       if(a.totals[s.release_id] > 0, a.totals[s.release_id], if(s.master_id != 0, a.median_s, 0)) AS seconds,
       a.totals[s.release_id] > 0 AS own_timing
FROM shelf AS s
LEFT JOIN album AS a ON a.master_id = s.master_id
ORDER BY seconds DESC
