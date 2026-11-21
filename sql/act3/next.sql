-- What to buy next: albums I don't own where several of the people behind my shelf worked together.
-- People are those who played, sang, produced, or engineered on my exact copies, minus the main artists and
-- anyone on more than 500 records (they're on everything). Only albums with a vinyl pressing since 2020 count,
-- and not by an artist already on my shelf: the point is finding records through the people, not the name.
WITH
mine AS (SELECT if(r.master_id != 0, r.master_id, 1000000000 + r.release_id) AS work FROM discogs.shelf AS s JOIN discogs.releases AS r ON r.release_id = s.release_id),
makers AS
(
    SELECT c.artist_id AS artist_id, any(c.artist_name) AS name, groupUniqArray(c.release_id) AS from_records
    FROM discogs.credits AS c
    JOIN discogs.role_map AS m ON m.role = c.role
    WHERE c.release_id IN (SELECT release_id FROM discogs.shelf) AND m.link = 'strong'
      AND c.artist_id NOT IN (SELECT arrayJoin(artist_ids) FROM discogs.releases WHERE release_id IN (SELECT release_id FROM discogs.shelf))
    GROUP BY c.artist_id
),
small AS (SELECT artist_id FROM discogs.edges WHERE artist_id IN (SELECT artist_id FROM makers) GROUP BY artist_id HAVING any(person_works) <= 500),
buyable AS (SELECT DISTINCT master_id FROM discogs.releases WHERE has(formats, 'Vinyl') AND year >= 2020 AND master_id != 0)
SELECT e.work AS work, any(w.title) AS title, any(w.year) AS year, any(w.artist_names) AS artists,
       uniqExact(e.artist_id) AS shared_people,
       groupUniqArray(mk.name) AS people,
       uniqExact(arrayJoin(mk.from_records)) AS from_my_records
FROM discogs.edges AS e
JOIN makers AS mk ON mk.artist_id = e.artist_id
JOIN discogs.works AS w ON w.work = e.work
WHERE e.artist_id IN (SELECT artist_id FROM small) AND e.strong AND NOT e.work_comp
  AND e.work NOT IN (SELECT work FROM mine) AND e.work IN (SELECT master_id FROM buyable)
  AND NOT hasAny(w.artist_names, (SELECT groupArray(arrayJoin(artist_names)) FROM discogs.releases WHERE release_id IN (SELECT release_id FROM discogs.shelf)))
GROUP BY e.work
HAVING shared_people >= 2
-- Rank by how many of my records an album draws on, so one busy string section can't decide it alone
ORDER BY from_my_records DESC, shared_people DESC, year DESC
LIMIT 8
