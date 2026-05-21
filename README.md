# api-example-apps

Small static example apps for people exploring the BTAA Geospatial API.

The root page is an app gallery. Each demo lives in its own folder under `apps/` so the project can grow as a collection of focused examples.

## Apps

- `apps/nearby-maps/` - searches for map records near a latitude and longitude.
- `apps/hexagons/` - maps API H3 hexagon aggregates for a viewport.
- `apps/provider-bubbles/` - maps provider facet counts as campus bubbles and shows resource-class counts.
- `apps/search-fight/` - compares two keyword searches by total matches and indexed-year facet counts.
- `apps/btaa-road-trip/` - follows the 18 BTAA campuses from Rutgers to the Pacific coast and loads map records for each stop.

## Links

- GitHub: https://github.com/ewlarson/api-example-apps
- GitHub Pages: https://ewlarson.github.io/api-example-apps/

## Run

```bash
/usr/bin/python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Add an App

1. Create a folder under `apps/`.
2. Keep the app self-contained with `index.html`, `styles.css`, and `app.js`.
3. Add a card for the app to the root `index.html`.

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

## BTAA Road Trip API Query

The BTAA Road Trip app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search
```

with a `gbl_resourceClass_sm[]=Maps` filter plus provider filters where the selected campus has a matching provider value. For newer BTAA members without a provider value in the API, it falls back to institution-name and nearby campus-map searches.
