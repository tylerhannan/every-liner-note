-- A second opinion on the reissue share: Discogs contributors also tag pressings "Reissue" or "Repress".
-- And how many best-ofs and compilations count as "new" because their album record is new, though the music isn't.
SELECT r.year AS year,
       round(avg(r.year - m.year >= 10), 4) AS ours,
       round(avg(has(r.format_descriptions, 'Reissue') OR has(r.format_descriptions, 'Repress')), 4) AS tagged,
       round(avg(has(r.format_descriptions, 'Compilation') AND r.year - m.year < 10), 4) AS compilations_counted_new
FROM discogs.releases AS r
JOIN discogs.masters AS m ON m.master_id = r.master_id
WHERE has(r.formats, 'Vinyl') AND r.year = 2025 AND m.year BETWEEN 1900 AND r.year
GROUP BY year
