-- Asks: When was each record on the shelf made? The year its album first came out, and the year that copy was pressed.
-- How: The shelf table joined to releases for the pressing year, and to masters for the album's year. The join to
--   masters is a LEFT JOIN, because bootlegs and other one-off pressings have no album, and their year stays 0.
SELECT s.release_id AS release_id, s.artist AS artist, trim(s.title) AS title, s.catalog_number AS catno,
       splitByString(', ', s.label)[1] AS label, m.year AS first_out, r.year AS pressed
FROM discogs.shelf AS s
JOIN discogs.releases AS r ON r.release_id = s.release_id
LEFT JOIN discogs.masters AS m ON m.master_id = r.master_id
ORDER BY if(first_out > 0, first_out, pressed), pressed
