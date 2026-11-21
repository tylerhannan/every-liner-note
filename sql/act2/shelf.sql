-- The shelf: when each album first came out, and when this copy was pressed.
-- Either can be 0: Discogs leaves some pressings undated, and bootlegs have no album to date.
SELECT s.release_id AS release_id, s.artist AS artist, trim(s.title) AS title, s.catalog_number AS catno,
       splitByString(', ', s.label)[1] AS label, m.year AS first_out, r.year AS pressed
FROM discogs.shelf AS s
JOIN discogs.releases AS r ON r.release_id = s.release_id
LEFT JOIN discogs.masters AS m ON m.master_id = r.master_id
ORDER BY if(first_out > 0, first_out, pressed), pressed
