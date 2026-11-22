CREATE DATABASE IF NOT EXISTS discogs;

CREATE TABLE IF NOT EXISTS discogs.releases
(
    release_id UInt32,
    master_id UInt32,
    is_main_release Bool,
    status LowCardinality(String),
    title String,
    country LowCardinality(String),
    released String,
    year UInt16,
    genres Array(LowCardinality(String)),
    styles Array(LowCardinality(String)),
    formats Array(LowCardinality(String)),
    format_descriptions Array(LowCardinality(String)),
    artist_ids Array(UInt32),
    artist_names Array(String),
    notes String CODEC(ZSTD(3)),
    data_quality LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY release_id;

-- One row per person per role per release: the edges for both the recommender and six degrees
CREATE TABLE IF NOT EXISTS discogs.credits
(
    release_id UInt32,
    master_id UInt32,
    artist_id UInt32,
    artist_name String,
    anv String,
    role LowCardinality(String),
    role_detail LowCardinality(String),
    scope Enum8('release_main' = 1, 'release_extra' = 2, 'track_main' = 3, 'track_extra' = 4),
    track_position String,
    is_sub_track Bool,
    -- BFS walks both ways, and the projection only carries what a hop needs
    -- A second copy sorted by release, for 'who is on these records' (the table's own order suits 'what did this person do')
    PROJECTION by_release (SELECT * ORDER BY release_id, artist_id)
)
ENGINE = MergeTree
ORDER BY (artist_id, master_id, release_id);

-- Labels and companies (pressing plants, studios, distributors) in one place
CREATE TABLE IF NOT EXISTS discogs.release_labels
(
    release_id UInt32,
    master_id UInt32,
    label_id UInt32,
    name String,
    catno String,
    kind Enum8('label' = 1, 'company' = 2),
    entity_type LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY (label_id, release_id);

-- Barcodes, matrix/runout etchings and friends: what tells one pressing from another
CREATE TABLE IF NOT EXISTS discogs.release_identifiers
(
    release_id UInt32,
    type LowCardinality(String),
    description String,
    value String
)
ENGINE = MergeTree
ORDER BY (release_id, type);

CREATE TABLE IF NOT EXISTS discogs.masters
(
    master_id UInt32,
    main_release_id UInt32,
    title String,
    year UInt16,
    genres Array(LowCardinality(String)),
    styles Array(LowCardinality(String)),
    artist_ids Array(UInt32),
    artist_names Array(String),
    data_quality LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY master_id;

CREATE TABLE IF NOT EXISTS discogs.artists
(
    artist_id UInt32,
    name String,
    realname String,
    profile String CODEC(ZSTD(3)),
    data_quality LowCardinality(String),
    name_variations Array(String)
)
ENGINE = MergeTree
ORDER BY artist_id;

-- Artist to artist edges: band members, the groups someone is in, and aliases
CREATE TABLE IF NOT EXISTS discogs.artist_links
(
    artist_id UInt32,
    other_id UInt32,
    other_name String,
    kind Enum8('member' = 1, 'group' = 2, 'alias' = 3)
)
ENGINE = MergeTree
ORDER BY (artist_id, kind, other_id);

CREATE TABLE IF NOT EXISTS discogs.labels
(
    label_id UInt32,
    name String,
    profile String CODEC(ZSTD(3)),
    parent_label_id UInt32,
    data_quality LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY label_id;

-- Your shelf, from Discogs' collection CSV export (see load_shelf.sh)
CREATE TABLE IF NOT EXISTS discogs.shelf
(
    release_id UInt32,
    artist String,
    title String,
    label String,
    catalog_number String,
    format String,
    released String,
    rating Nullable(UInt8),
    folder LowCardinality(String),
    date_added DateTime,
    media_condition LowCardinality(String),
    sleeve_condition LowCardinality(String),
    notes String
)
ENGINE = ReplacingMergeTree(date_added)
ORDER BY release_id;

-- Tracklists with durations in seconds (0 when Discogs has none); sub-tracks keep their parent's index
CREATE TABLE IF NOT EXISTS discogs.release_tracks
(
    release_id UInt32,
    track_idx UInt16,
    parent_idx Int16,
    position String,
    title String,
    seconds UInt32
)
ENGINE = MergeTree
ORDER BY (release_id, track_idx);

-- Each format on a release, with the free-text description where colours live ("smoke orange", "yellow/black splatter")
CREATE TABLE IF NOT EXISTS discogs.release_formats
(
    release_id UInt32,
    name LowCardinality(String),
    qty String,
    text String,
    descriptions Array(LowCardinality(String))
)
ENGINE = MergeTree
ORDER BY release_id;

-- Built once per dump by sql/ai/colours.sql (aiClassify): each distinct vinyl colour phrase and its plain colour
CREATE TABLE IF NOT EXISTS discogs.vinyl_colours
(
    phrase String,
    colour LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY phrase;
