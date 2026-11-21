-- How many ways limited vinyl describes its colour, and how much of that the classified phrases cover
SELECT uniqExact(lower(f.text)) AS phrases,
       (SELECT count() FROM discogs.vinyl_colours) AS classified,
       round(countIf(lower(f.text) IN (SELECT phrase FROM discogs.vinyl_colours)) / count(), 3) AS coverage
FROM discogs.release_formats AS f
JOIN discogs.releases AS r ON r.release_id = f.release_id
WHERE f.name = 'Vinyl' AND has(f.descriptions, 'Limited Edition') AND r.year >= 2015 AND f.text != ''
