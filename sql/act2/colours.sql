-- What colour is limited vinyl? Each distinct colour phrase was sorted once by aiClassify at build time
-- (sql/ai/colours.sql); this just counts limited vinyl pressings since 2015 by that colour.
SELECT c.colour AS colour, count() AS pressings, round(count() / sum(count()) OVER (), 4) AS share
FROM discogs.release_formats AS f
JOIN discogs.releases AS r ON r.release_id = f.release_id
JOIN discogs.vinyl_colours AS c ON c.phrase = lower(f.text)
WHERE f.name = 'Vinyl' AND has(f.descriptions, 'Limited Edition') AND r.year >= 2015 AND c.colour != 'not a colour'
GROUP BY colour
ORDER BY pressings DESC
