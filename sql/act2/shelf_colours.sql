-- My records whose vinyl has a named colour, as the build-time aiClassify run sorted it
SELECT s.release_id AS release_id, trim(s.title) AS title, s.artist AS artist, f.text AS phrase, c.colour AS colour
FROM discogs.shelf AS s
JOIN discogs.release_formats AS f ON f.release_id = s.release_id AND f.name = 'Vinyl'
JOIN discogs.vinyl_colours AS c ON c.phrase = lower(f.text)
WHERE c.colour NOT IN ('black', 'not a colour')
ORDER BY c.colour, s.artist
