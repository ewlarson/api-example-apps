# Dupe Finder

A small BTAA Geospatial API demo for identifying possible duplicate records.

## What it does

- Searches `/api/v1/search` for a small set of seed records.
- Fetches each seed with `/api/v1/resources/{id}`.
- Reads `data.meta.ui.similar_items`, the API's Elasticsearch-backed similar-record output.
- Displays candidate duplicate groups with lightweight title/class/date signals.

The app treats these as review candidates, not confirmed duplicates.
