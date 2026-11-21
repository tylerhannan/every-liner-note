-- The shelf as it appears on the cover wall
SELECT s.release_id AS release_id, s.artist AS artist, trim(s.title) AS title, s.catalog_number AS catno,
       splitByString(', ', s.label)[1] AS label, s.format AS format, r.country AS country,
       if(m.year > 0, m.year, r.year) AS first_out, r.year AS pressed, r.genres AS genres, r.styles AS styles
FROM discogs.shelf AS s
JOIN discogs.releases AS r ON r.release_id = s.release_id
LEFT JOIN discogs.masters AS m ON m.master_id = r.master_id
ORDER BY s.date_added
