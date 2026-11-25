-- Asks: Who on Discogs has this in their name? Everyone credited anywhere, most credited first.
-- How: Scans the people table, one row per person credited anywhere, which the load builds once from the credits. ILIKE
--   matches any part of a name in any case. There's no index on the names, because a full-text index works on whole words
--   and this matches part of one, and reading the whole column is quick anyway.
-- Try: ILIKE concat('%', {name:String}, '%') => ILIKE concat({name:String}, '%') | Only names that start with what you typed.
-- Try: LIMIT 10 => LIMIT 50 | More of them.
SELECT artist_id, name, credits
FROM discogs.people
WHERE name ILIKE concat('%', {name:String}, '%')
ORDER BY credits DESC
LIMIT 10
