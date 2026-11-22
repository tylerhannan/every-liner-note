-- Asks: How old is the music on new vinyl? Every vinyl release each year, split by how long after the album first came out
--   it was pressed.
-- How: Reads vinyl_by_age, a summary table that sql/graph.sql builds at load time: every vinyl pressing counted by year,
--   by how many years after the album it came out, and by whether it's tagged Reissue or Repress or is a compilation.
--   That's a few thousand rows instead of every release joined to its album. sumIf picks out the buckets: within a year
--   of the album is new, two to nine years later is catalogue, and ten or more is a reissue. The same sums give the
--   reissues' average age and the footnote's second opinion.
-- Try: >= 10 => >= 20 | A reissue has to be 20 or more years after the album, so the reissue share drops.
SELECT year,
       sumIf(pressings, age <= 1) AS new,
       sumIf(pressings, age BETWEEN 2 AND 9) AS catalogue,
       sumIf(pressings, age >= 10) AS reissue,
       round(sumIf(age * pressings, age >= 10) / sumIf(pressings, age >= 10), 1) AS reissue_avg_age,
       round(sumIf(pressings, tagged) / sum(pressings), 4) AS tagged,
       round(sumIf(pressings, compilation AND age < 10) / sum(pressings), 4) AS compilations_counted_new
FROM discogs.vinyl_by_age
GROUP BY year
ORDER BY year
