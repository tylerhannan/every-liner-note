-- Share of records carrying each genre: my shelf against every vinyl release pressed since 2015
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
