# api-example-apps

Small static example apps for people exploring the BTAA Geospatial API.

The root page is an app gallery. Each demo lives in its own folder under `apps/` so the project can grow as a collection of focused examples.

## Apps

- `apps/nearby-maps/` - searches for map records near a latitude and longitude.

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

## Nearby Maps API Query

The Nearby Maps app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search
```

with a distance filter on `dcat_centroid`, an optional `gbl_resourceClass_sm[]=Maps` filter, and client-side distance sorting across up to five returned pages.
