# api-example-apps

Small static example apps for people exploring the BTAA Geospatial API.

The root page is an app gallery. Each demo lives in its own folder under `apps/` so the project can grow as a collection of focused examples.

## Start Here

- New contributor guide: `CONTRIBUTING.md`
- Copyable app starter: `templates/example-app/`

## Apps

- `apps/nearby-maps/` - searches for map records near a latitude and longitude.
- `apps/hexagons/` - maps API H3 hexagon aggregates for a viewport.
- `apps/provider-bubbles/` - maps provider facet counts as campus bubbles and shows resource-class counts.
- `apps/search-fight/` - compares two keyword searches by total matches and indexed-year facet counts.
- `apps/metadata-scorecard/` - fetches a resource by ID, displays its OGM metadata record, and scores metadata quality from a CSV scoring matrix.
- `apps/btaa-road-trip/` - follows the 18 BTAA campuses from Rutgers to the Pacific coast and loads map records for each stop.
- `apps/map-memory/` - matches real map thumbnails from 26 U.S. city choices, with dated availability labels and major urban areas in every BTAA state. [Coverage audit](apps/map-memory/COVERAGE.md): 20 currently playable cities.

## Links

- GitHub: https://github.com/ewlarson/api-example-apps
- GitHub Pages: https://ewlarson.github.io/api-example-apps/

## Run

```bash
/usr/bin/python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Add an App

1. Read `CONTRIBUTING.md`.
2. Copy `templates/example-app/` to `apps/your-app-slug/`.
3. Keep the app self-contained with `index.html`, `styles.css`, and `app.js`.
4. Add a card for the app to the root `index.html`.
5. Add the app and its API query notes to this README.

## GitHub Pages

The published site uses GitHub Pages via GitHub Actions from the root of the `main` branch.
The deployment workflow lives at `.github/workflows/pages.yml`.

## Nearby Maps API Query

The Nearby Maps app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search
```

with a distance filter on `dcat_centroid`, an optional `gbl_resourceClass_sm[]=Maps` filter, and client-side distance sorting across up to five returned pages.

## Hexagons API Query

The Hexagons app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/map/h3
```

with `bbox` and `resolution` parameters, plus optional search and resource-class filters.

## Provider Bubbles API Queries

The Provider Bubbles app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search/facets/schema_provider_s
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search/facets/gbl_resourceClass_sm
```

with `/search` for the overall Geoportal total, the provider facet endpoint for bubble sizes, and the resource-class facet endpoint for the selected provider breakdown.

## Search Fight API Queries

The Search Fight app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search/facets/gbl_indexYear_im
```

with `/search` for each query's total match count and sample records, and the indexed-year facet endpoint for the timeline comparison.

## Metadata Scorecard API Query

The Metadata Scorecard app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/resources/{id}
```

with the entered resource ID, then loads `apps/metadata-scorecard/scoring-matrix.csv` to score fields in `attributes.ogm`. Present fields earn the matrix `Importance` value, except Resource Type, whose values must all match its controlled vocabulary. Records missing any field marked `Required?` receive an automatic failing grade.

## BTAA Road Trip API Query

The BTAA Road Trip app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search
```

with a `gbl_resourceClass_sm[]=Maps` filter plus provider filters where the selected campus has a matching provider value. For newer BTAA members without a provider value in the API, it falls back to institution-name and nearby campus-map searches.

## Map Memory API Queries

Map Memory uses `https://geo.btaa.org/api/v1/search` with the supported
`include_filters[gbl_resourceClass_sm][]=Maps` filter and a title-specific `adv_q`.
It requests up to 100 records, then falls back to a city + state + map query when
fewer than eight usable thumbnails survive, followed by a supported 25 km
centroid-distance query. It checks geographic bounds and
city subjects to reject publisher-only matches and statewide/national maps.

Thumbnails come from `meta.ui.thumbnail_url` or `/api/v1/resources/{id}/thumbnail`.
The app fetches and decodes raster images before dealing, rejects SVG fallbacks,
and deduplicates resource IDs, normalized titles, image URLs, bytes, and near-identical
spatial pixel patterns and reviewed duplicate editions. Covers, index masks and
blank images are rejected; reviewed IIIF map sheets can replace known covers.
It samples up to 48 candidates per query and retains up to 23 usable
images for New maps; Play again reshuffles the current deck. Four to seven maps
produce a smaller board; fewer than four show retry and playable-city suggestions.
Dated picker labels disclose availability before selection; API failures remain
distinct from missing imagery.

The public API and thumbnail endpoints allow browser CORS requests from the Pages
origin. No credentials, backend, static catalog, package install, or build is required.
Revealed cards open a full OGM/IIIF lightbox with metadata. The card backs layer
the compass design over a grayscale MapLibre/OpenFreeMap city basemap.
See [Map Memory notes](apps/map-memory/README.md) for contract checks and verification.

Run the repeatable tests with Node 22+:

```sh
node --test apps/map-memory/tests/*.test.mjs
```
