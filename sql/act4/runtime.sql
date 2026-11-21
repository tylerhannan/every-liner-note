-- How long the shelf takes to play. A pressing with every track timed counts as is; otherwise borrow the
-- median running time of fully timed pressings of the same album. Sub-tracks are inside their parent, so skip them.
WITH
shelf AS (SELECT s.release_id, r.master_id, trim(s.title) AS title, s.artist, s.format FROM discogs.shelf AS s JOIN discogs.releases AS r ON r.release_id = s.release_id),
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
)
SELECT s.release_id AS release_id, s.artist AS artist, s.title AS title,
       if(match(s.format, '(\d+)xLP'), toUInt32(extract(s.format, '(\d+)xLP')), 1) AS discs,
       if(own.total_s > 0, own.total_s, a.median_s) AS seconds,
       own.total_s > 0 AS own_timing
FROM shelf AS s
LEFT JOIN timed AS own ON own.release_id = s.release_id
LEFT JOIN album AS a ON a.master_id = s.master_id
ORDER BY seconds DESC
