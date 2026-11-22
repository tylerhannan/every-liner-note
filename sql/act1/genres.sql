-- Asks: Which genres does the shelf have more of than vinyl in general?
-- How: Two passes over the releases table. One joins it to the shelf table, the other takes every vinyl release since
--   2015, and in both arrayJoin turns each release's genre array into one row per genre. Each count is divided by its own
--   total, and a LEFT JOIN lines the two shares up by genre. Only the formats, year, and genres columns get read.
-- Try: year >= 2015 => year BETWEEN 1970 AND 1979 | The shelf against 1970s vinyl. The heading changes to whichever genre stands out.
WITH shelf AS
(
    SELECT arrayJoin(r.genres) AS genre, count() / (SELECT count() FROM discogs.shelf) AS shelf_share
    FROM discogs.shelf AS s JOIN discogs.releases AS r ON r.release_id = s.release_id
    GROUP BY genre
),
discogs AS
(
    SELECT arrayJoin(genres) AS genre, count() / (SELECT count() FROM discogs.releases WHERE has(formats, 'Vinyl') AND year >= 2015) AS discogs_share
    FROM discogs.releases
    WHERE has(formats, 'Vinyl') AND year >= 2015
    GROUP BY genre
)
SELECT d.genre AS genre, round(ifNull(s.shelf_share, 0), 3) AS shelf_share, round(d.discogs_share, 3) AS discogs_share
FROM discogs AS d LEFT JOIN shelf AS s ON s.genre = d.genre
ORDER BY d.discogs_share DESC
SETTINGS join_use_nulls = 1
