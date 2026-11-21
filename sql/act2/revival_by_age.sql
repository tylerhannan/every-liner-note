-- Vinyl releases per year, split by how old the album was when this pressing came out
SELECT r.year AS year,
       countIf(r.year - m.year <= 1) AS new,
       countIf(r.year - m.year BETWEEN 2 AND 9) AS catalogue,
       countIf(r.year - m.year >= 10) AS reissue,
       round(avgIf(r.year - m.year, r.year - m.year >= 10), 1) AS reissue_avg_age
FROM discogs.releases AS r
JOIN discogs.masters AS m ON m.master_id = r.master_id
WHERE has(r.formats, 'Vinyl') AND r.year BETWEEN 1955 AND 2026 AND m.year BETWEEN 1900 AND r.year
GROUP BY year
ORDER BY year
