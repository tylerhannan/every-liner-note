-- Load the build-time aiClassify colours. __COLOURS__ is file() for a local build and url() on Cloud.
CREATE TABLE IF NOT EXISTS discogs.vinyl_colours (phrase String, colour LowCardinality(String)) ENGINE = MergeTree ORDER BY phrase;
TRUNCATE TABLE discogs.vinyl_colours;
-- The model calls anything that isn't a colour ("180g", "1st pressing") black, so black has to be said out loud,
-- and "purple labels" is the label's colour, not the vinyl's
INSERT INTO discogs.vinyl_colours
SELECT phrase, multiIf(colour = 'black' AND NOT match(phrase, 'black|noir|schwarz|zwart|nero|negro|onyx|jet|ebony|obsidian|coal|midnight'), 'not a colour',
                       match(phrase, 'label') AND NOT match(phrase, 'vinyl|wax|disc|record'), 'not a colour',
                       colour)
FROM __COLOURS__;
