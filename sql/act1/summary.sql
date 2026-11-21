-- The shelf in a few numbers
WITH works AS
(
    SELECT if(r.master_id != 0, r.master_id, 1000000000 + r.release_id) AS work, r.release_id, r.master_id, r.year
    FROM discogs.shelf AS s JOIN discogs.releases AS r ON r.release_id = s.release_id
)
SELECT
    (SELECT count() FROM discogs.shelf) AS records,
    (SELECT count() FROM discogs.releases) AS releases,
    (SELECT count() FROM discogs.credits) AS credits,
    (SELECT uniqExact(artist_id) FROM discogs.edges WHERE work IN (SELECT work FROM works)) AS people,
    (SELECT uniqExact(release_id) FROM discogs.releases WHERE master_id IN (SELECT master_id FROM works WHERE master_id != 0)) AS versions_of_these_albums
