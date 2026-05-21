# api-example-apps

Small static example apps for people exploring the BTAA Geospatial API.

The root page is an app gallery. Each demo lives in its own folder under `apps/` so the project can grow as a collection of focused examples.

## Apps

- `apps/nearby-maps/` - searches for map records near a latitude and longitude.

## Run

```bash
/usr/bin/python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Add an App

1. Create a folder under `apps/`.
2. Keep the app self-contained with `index.html`, `styles.css`, and `app.js`.
3. Add a card for the app to the root `index.html`.

## Publish to GitHub

After authenticating with GitHub CLI, this project can be published as `api-example-apps`:

```bash
gh auth login -h github.com
git add .
git commit -m "Rename project to api-example-apps"
gh repo create ewlarson/api-example-apps --public --source=. --remote=origin --push
```

Use `--private` instead of `--public` if the repository should start private.

For GitHub Pages, open the repository settings, choose Pages, and publish from the `main` branch root.

## Nearby Maps API Query

The Nearby Maps app calls:

```text
https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1/search
```

with a distance filter on `dcat_centroid`, an optional `gbl_resourceClass_sm[]=Maps` filter, and client-side distance sorting across up to five returned pages.
