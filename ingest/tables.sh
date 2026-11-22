# The Discogs tables the page reads, as table:split key:pieces. Shared by export_parquet.sh and load_cloud.sh.
# More pieces if a file ever gets near GitHub's 2 GiB limit for release files.
TABLES="releases:release_id:3 credits:release_id:4 release_tracks:release_id:5 release_formats:release_id:1 masters:master_id:1"
