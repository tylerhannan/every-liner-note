-- Asks: What has this person done, and when? Their credits by role and by decade, and which of them are on the shelf.
-- How: The credits table is sorted by artist_id, so one person's credits are a primary-key lookup. The join to releases
--   for the year gets the same release IDs as a filter, so it skips the parts of releases that none of them are in, which
--   is most of it for most people and not much of it for someone on thousands of records. An empty role is a credit as
--   the main artist, and decade 0 is a release with no year.
-- Try: WHERE c.artist_id = {artist_id:UInt32} => WHERE c.artist_id = {artist_id:UInt32} AND c.scope IN ('release_extra', 'track_extra') | Only the liner-note credits, not records under their own name.
SELECT if(c.role = '', 'Main artist', c.role) AS role,
       if(r.year > 0, intDiv(r.year, 10) * 10, 0) AS decade,
       count() AS credits,
       groupUniqArrayIf(c.release_id, c.release_id IN (SELECT release_id FROM discogs.shelf)) AS on_shelf
FROM discogs.credits AS c
JOIN discogs.releases AS r ON r.release_id = c.release_id
WHERE c.artist_id = {artist_id:UInt32}
  AND r.release_id IN (SELECT release_id FROM discogs.credits WHERE artist_id = {artist_id:UInt32})
GROUP BY role, decade
ORDER BY credits DESC
