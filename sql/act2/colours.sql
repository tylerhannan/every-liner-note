-- Asks: What colour is limited-edition vinyl? Every limited vinyl pressing since 2015, by the colour in its format text.
-- How: Joins release_formats to vinyl_colours, which aiClassify filled once at build time by sorting the free-text colour
--   descriptions, and to releases for the year. count() per colour, and sum(count()) OVER () is a window function that
--   turns the counts into shares without a second pass.
-- Try: AND c.colour != 'not a colour' => AND c.colour != 'not a colour' AND has(r.genres, 'Classical') | Only classical records.
-- Try: r.year >= 2015 => r.year BETWEEN 1990 AND 1999 | Limited editions from the 1990s instead.
SELECT c.colour AS colour, count() AS pressings, round(count() / sum(count()) OVER (), 4) AS share
FROM discogs.release_formats AS f
JOIN discogs.releases AS r ON r.release_id = f.release_id
JOIN discogs.vinyl_colours AS c ON c.phrase = lower(f.text)
WHERE f.name = 'Vinyl' AND has(f.descriptions, 'Limited Edition') AND r.year >= 2015 AND c.colour != 'not a colour'
GROUP BY colour
ORDER BY pressings DESC
