# City coverage — November 12, 2026

The visual review supports **19 playable cities: 17 eight-pair boards and two
smaller boards**. Only those cities appear in the picker. Columbus now has three
suitable images after removing a text-heavy geology guide; it joins the six
previously hidden cities until better imagery is reviewed.

Every playable thumbnail must now match a visually approved city/resource ID and
its exact SHA-256 image digest. A plausible Maps label, title, or geographic subject
is insufficient. Unknown records and changed image bytes are excluded, including
on random selections and “New maps.” Searches, metadata and images remain live;
the approval manifest contains no offline image deck or credentials.

Counts below are sampled loader pools, not exhaustive collection totals. The
approved inventory can be larger; a live game retains at most 23 decoded maps.
Network failures still do not erase coverage counts or masquerade as missing maps.

| City | Usable maps in sampled pool | Board |
| --- | ---: | --- |
| Chicago, IL | 20 | 8 pairs |
| San Francisco, CA | 20 | 8 pairs |
| Seattle, WA | 8 | 8 pairs |
| New York City, NY | 9 | 8 pairs |
| Los Angeles, CA | 19 | 8 pairs |
| Houston, TX | 22 | 8 pairs |
| Philadelphia, PA | 16 | 8 pairs |
| Boston, MA | 20 | 8 pairs |
| Washington, DC | 16 | 8 pairs |
| Atlanta, GA | 3 | Hidden (fewer than 4) |
| Austin, TX | 23 | 8 pairs |
| Baltimore, MD | 18 | 8 pairs |
| Columbus, OH | 3 | Hidden (fewer than 4) |
| Dallas, TX | 20 | 8 pairs |
| Denver, CO | 2 | Hidden (fewer than 4) |
| Des Moines, IA | 1 | Hidden (fewer than 4) |
| Detroit, MI | 19 | 8 pairs |
| Indianapolis, IN | 20 | 8 pairs |
| Miami, FL | 0 | Hidden (fewer than 4) |
| Milwaukee, WI | 3 | Hidden (fewer than 4) |
| Minneapolis, MN | 20 | 8 pairs |
| New Orleans, LA | 3 | Hidden (fewer than 4) |
| Newark, NJ | 20 | 8 pairs |
| Omaha, NE | 8 | 8 pairs |
| Portland, OR | 4 | 4 pairs |
| San Diego, CA | 7 | 7 pairs |

## What changed

- Title search → city/state fallback → supported 25 km centroid search, all filtered
  to Maps. Local evidence is still required; publisher/institution mentions never
  establish relevance. Route-series sheets must actually depict the city in their
  own segment, not just name it in the series title.
- Reviewed, record-specific exceptions recover seven Omaha maps and one Columbus
  quadrangle with coarse catalog bounds. Four local camp/survey records have
  reviewed geographic evidence. These exceptions do not open statewide searches.
- Four Stanford records use the real map on page 2 of their API-linked IIIF
  manifests. Overrides require that exact manifest in current API metadata; the
  viewer explains the preview page. Both manifest and image CORS were checked.
- Covers, volume bindings, Sanborn cover/index identifiers and Maps Index titles
  are rejected. A 64×64 pixel check also rejects blank images and solid black/white
  raster masks. Reviewed title-page exceptions are listed in `quality.mjs`.
- Byte/title/URL checks, spatial image similarity and reviewed edition groups
  remove visually repeated maps. Similar beige paper alone no longer makes two
  different street plans duplicates. New Orleans therefore loses its former
  misleading four-image “playable” count.
- HTTP errors, rate limits and timeouts remain distinct from unusable images.
  A partial playable pool can survive a later request failure with a warning.
  Failed requests do not overwrite the dated picker availability.

## Visual evidence and review boundary

[Visual decisions](visual-review.json) record **477 inspected images**: all 338
previously accepted pool images, 132 additional collected candidate rasters, and
seven Philadelphia companion pages freshly fetched from the public API. Review
covered every city in the 26-city audit catalog (Miami had no usable raster).
This is a complete review of these collected candidate images, not a claim to have
inspected every record in the entire BTAA catalog. Unreviewed records are blocked.

The Philadelphia companion pages include six text-only descriptions/tables despite
map-like titles. Their earlier responses were non-raster fallbacks; later generated
thumbnails exposed the text pages. The parent map remains eligible. Additional
exclusions include skyline illustrations, text-dominated sheets, mostly blank or
faded plans, a corrupted scan, and an atlas key sheet. Each exclusion has a reason.
Duplicate title/image/reviewed edition groups are removed before compilation.

[Runtime approvals](reviewed-maps.mjs) contain **423 reviewed image digests**.
Every one decoded successfully through `preloadThumbnail` in Chromium, including
hash verification, raster dimensions, mask checks and canvas sampling. The actual
`loadCity` pipeline then ran for all 26 cities with deterministic sampling and zero
request failures; [browser audit results](coverage-audit.json) record accepted IDs,
URLs, digests and diagnostics. Public API responses recorded on this date were
replayed locally so anonymous request quotas did not distort the all-city audit.
No credential was sent to that browser harness or committed in these files.

Approval is deliberately strict: even a harmless thumbnail re-encoding needs a
fresh review if its bytes change. The app may consequently show fewer maps until
review catches up. It never substitutes a new image based only on matching metadata.

## Refreshing the review

1. Collect the three supported `searchUrl` queries for each canonical city and
   normalize candidates. Save the actual image bytes; inspect the whole proposed
   inventory at card size, including companion pages, not just eight dealt maps.
2. Record the ID, city, title, source URL, dimensions, SHA-256 digest, decision and
   reason in `visual-review.json`. Approve actual legible maps and spatial plans;
   reject text pages, bindings, covers, index sheets, placeholders and panoramas.
   Review changed bytes again; never update a digest just to make a test pass.
3. Run `node apps/map-memory/scripts/compile-review.mjs`. This validates and compiles
   manual decisions; it does not approve images. It retains the existing duplicate
   title, image and edition-group protections.
4. Decode every compiled image with the real browser pipeline, then run `loadCity`
   for all cities. Update `coverage-audit.json`, this table and `coverage.mjs` only
   after successful requests. Cities need four distinct reviewed maps to reappear.
5. Run `node --test apps/map-memory/tests/*.test.mjs` and smoke-test live play.
   Keep any audit credentials in the CLI/server process, never in browser assets.
