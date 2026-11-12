# Map Memory

A buildless HTML/CSS/JavaScript memory game using real BTAA map thumbnails.
Open `index.html` through a static HTTP server, not a `file:` URL.

```sh
# From the repository root
python3 -m http.server 4173
# http://localhost:4173/apps/map-memory/
node --test apps/map-memory/tests/*.test.mjs
```

The repository's Pages workflow uploads the source tree unchanged. The expected
post-merge URL is <https://ewlarson.github.io/api-example-apps/apps/map-memory/>.
This is not a deployed PR preview. Browser verification used
`http://127.0.0.1:4173/api-example-apps/apps/map-memory/` with the repository mounted
under that subpath. No build command or package installation is needed.

## API contracts checked live — November 12, 2026

Read <https://geo.btaa.org/api/docs> and its `/api/openapi.json` schema, then
inspected actual responses:

- `GET /api/v1/search`: JSON:API `data[]`, `attributes.ogm`, `meta.ui`, and
  `meta.totalCount`; `per_page` accepts 1–100. `adv_q` accepts JSON clauses such as
  `[{"op":"AND","f":"dct_title_s","q":"\"Chicago\""}]`.
- `include_filters[gbl_resourceClass_sm][]=Maps` returns Maps records. The fallback
  uses a quoted city + state + map query, with the same local relevance checks.
- `meta.ui.thumbnail_url` points to cached `/api/v1/thumbnails/{hash}` images or
  `/api/v1/resources/{id}/thumbnail`. The resource endpoint can redirect to a cached
  raster **or return a generic SVG fallback with HTTP 200**. SVGs are not playable.
- Search and thumbnail requests with `Origin: https://ewlarson.github.io` returned
  `Access-Control-Allow-Origin: *`. Cross-origin fetch, redirect, raster decoding,
  and canvas sampling also succeeded from the local Pages-shaped browser preview.
  No credentials, backend, or static catalog are used.
- `GET /api/v1/resources/{id}/ogm-viewer?embed=true` is the API's supported HTML
  embed, with `Content-Security-Policy: frame-ancestors *`. The lightbox uses this
  full OGM/IIIF viewer, including tiled zoom and multi-page controls. The iframe's
  `scrolling="no"` suppresses its document scrollbars; the viewer's own controls
  remain usable. Metadata comes from the same live search record.

## Selection and game behavior

`core.mjs` keeps display labels/aliases separate from canonical search terms and
coordinates. Searches require city evidence in the title or geographic subject;
publisher, institution, and description mentions never establish relevance.
Bounds reject distant, statewide, and national maps. West New York, NJ is excluded
from NYC. Atlas volumes and brochures are excluded because they often thumbnail
covers. Two specifically inspected SF records are also excluded: a folded-map
cover (`stanford-hm701yz9300`) and a world map incorrectly bounded to the city
(`eacef6c9-3b5a-41e0-83ee-098d84947ad9`).

`api.mjs` requests up to 100 records per query and inspects at most 48 candidates,
four thumbnails at a time. Distinctive subjects are prioritized, with a randomized
remaining sample. Up to 23 usable images are retained in memory. Dedupe covers IDs,
normalized titles, thumbnail URLs, SHA-256 image bytes, and near-identical 12×12 RGB
samples. Tiny or excessively narrow images are rejected. Accepted images are fully
decoded into local blob URLs before play; URLs are released on city change/cancel.
Visual similarity is a heuristic, and source images/metadata can change.

Eight maps produce 16 shuffled cards. Four to seven produce a smaller board with
an explanation; fewer than four expose retry and city-switch guidance. Play again
reshuffles the same maps. New maps draws from the validated pool, prioritizing
unused resources so the selection changes; it is disabled when there are no extras.
A new city selection starts a fresh live request. Generation checks protect against
both late successes and late errors, even if an underlying loader ignores abort.

Cards are real buttons with concealed identities until revealed, persistent focus,
and polite match announcements. Mismatches remain visible for 1100ms, blocking a
third activation. Explore controls appear only on revealed cards and open a native
modal dialog with full image, dates, institution, creator, place, rights, description,
and a Geoportal link. The mismatch clock pauses while exploring; Escape/Close returns
focus to the card and resumes play. Reduced motion disables transitions.

## City basemap backs

The original compass/line design overlays a grayscale MapLibre rendering centered
on the selected city. One temporary WebGL map produces a shared snapshot for all
cards, then releases its renderer. City snapshots are cached in memory. Switching
cities cancels old renders and clears the old background immediately. The original
card pattern remains usable if WebGL, the CDN, or tiles are unavailable.

- Pinned MapLibre GL JS 5.24.1 browser bundle from unpkg (no build dependency).
- [OpenFreeMap Positron](https://openfreemap.org/quick_start/) vector basemap,
  with OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution below the board.
- [MapLibre map options](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)
  for canvas snapshot rendering. No basemap credentials are needed.

## Verification

- 24 repeatable Node tests: deck construction, dedupe/relevance, pair matching,
  mismatch timing, reset, modal pause/resume, stale city success/error, cancellation
  cleanup, unusable images, 3/4/7/8-map results, fallback queries, and Pages assets.
- Live Chicago, San Francisco, Seattle, and NYC searches each yielded eight usable
  pairs. Completed games by keyboard and visually inspected the revealed images:
  Chicago wards/parks/pictorial streets; SF harbor/tour/geology maps; Seattle city,
  transit, harbor, and exposition maps; NYC streets, bay, and harbor maps.
  Visual inspection prompted the cover and world-map exclusions above.
- Keyboard city filtering and explicit selection, NYC alias, replay, completion
  metadata, focus retention, and responsive two-column cards checked in-browser.
- Full IIIF viewer opened while playing; zoom, Escape, focus return, and metadata
  verified. Desktop and 390px phone layouts inspected.
- All existing apps and the starter pass JavaScript syntax checks and static local
  link checks. The gallery and all app/template HTML/CSS/JS/module/data assets return
  HTTP 200 under `/api-example-apps/`. Existing app source and Pages deployment
  workflow are unchanged. `Test static apps` runs the checks on PRs.

Live availability and thumbnail resolution vary by contributing library. The
library-hosted IIIF viewer can fail independently of the preloaded game; the modal
always provides a direct BTAA record link. No offline guarantee is implied.

## Screenshots

![Map Memory with city basemap card backs](screenshots/desktop.jpg)

![Full IIIF map and metadata in the lightbox](screenshots/lightbox.jpg)

[Mobile layout](screenshots/mobile.jpg) · [Completed game and map collection](screenshots/completed-game.jpg)
