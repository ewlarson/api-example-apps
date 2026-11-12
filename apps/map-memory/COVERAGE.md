# City coverage — November 12, 2026

The revised loader produced **20 playable cities: 17 eight-pair boards and three
smaller boards**. Only those 20 cities appear in the picker. The six cities with
fewer than four maps are hidden, and remain in this audit catalog for a future
coverage refresh. If a selectable city later loses enough imagery, the game explains
the result, offers retry/alternatives, and removes it from the picker for that session.
Network failures do not remove cities from the list.

Update `coverage.mjs` to restore a hidden city after verifying at least four maps.
No city-specific UI change is needed.

These are dated, sampled loader pools, not exhaustive collection totals or promises
of future availability. The game always searches and validates live images again.
Counts above eight provide a pool for “New maps.”

| City | Usable maps in sampled pool | Board | Notes |
| --- | ---: | --- | --- |
| Chicago, IL | 21 | 8 pairs |  |
| San Francisco, CA | 23 | 8 pairs |  |
| Seattle, WA | 8 | 8 pairs |  |
| New York City, NY | 9 | 8 pairs |  |
| Los Angeles, CA | 19 | 8 pairs |  |
| Houston, TX | 22 | 8 pairs |  |
| Philadelphia, PA | 18 | 8 pairs |  |
| Boston, MA | 20 | 8 pairs |  |
| Washington, DC | 17 | 8 pairs |  |
| Atlanta, GA | 3 | Hidden (fewer than 4) | Three usable local maps, including Camp Gordon. |
| Austin, TX | 22 | 8 pairs |  |
| Baltimore, MD | 18 | 8 pairs |  |
| Columbus, OH | 4 | 4 pairs | Four distinct maps, including a reviewed Columbus geological quadrangle. |
| Dallas, TX | 21 | 8 pairs |  |
| Denver, CO | 2 | Hidden (fewer than 4) | Two usable maps; remaining candidate has no playable raster. |
| Des Moines, IA | 1 | Hidden (fewer than 4) | Camp Dodge recovered. City atlas/other candidates lack usable images; distant Des Moines County excluded. |
| Detroit, MI | 22 | 8 pairs |  |
| Indianapolis, IN | 23 | 8 pairs |  |
| Miami, FL | 0 | Hidden (fewer than 4) | No usable raster thumbnails in the checked local candidates. |
| Milwaukee, WI | 3 | Hidden (fewer than 4) | Highway map and two local survey plats. Most other records have no usable image; blank survey back rejected. |
| Minneapolis, MN | 20 | 8 pairs |  |
| New Orleans, LA | 3 | Hidden (fewer than 4) | Near-duplicate exposition scans count once; three distinct maps remain. |
| Newark, NJ | 20 | 8 pairs |  |
| Omaha, NE | 8 | 8 pairs | Recovered reviewed city maps with coarse statewide catalog bounds. |
| Portland, OR | 4 | 4 pairs | Four distinct maps; similar paper colors no longer collapse different images. |
| San Diego, CA | 7 | 7 pairs | Seven distinct maps, including two reviewed IIIF map sheets instead of covers. |

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

## Evidence and limits

[Machine-readable browser audit](coverage-audit.json) records every accepted ID,
title, thumbnail URL, record link and per-city diagnostics. Public responses were
fetched from the live API on the date above, with the private affiliate credential
used only in the local audit process. No credential went to the browser or these
files. A temporary local harness replayed those same public bytes through the
actual `loadCity`, `Image.decode` and canvas code in Chromium. The final pass had
**zero request failures across all 26 cities**. This separates image availability
from the anonymous browser quota while still checking browser decoding.

All accepted sampled pools were reviewed on contact sheets at roughly card size;
additional covers, plain-text indexes, unrelated route segments, and similar
editions were removed during review. Filters are heuristics, and a randomized
future selection can expose a new catalog or image-quality problem. The audit is
not a guarantee about every record in the API. Do not raise coverage counts by
counting placeholders, covers, duplicates or unrelated places.

For a refresh, run the three queries from `searchUrl` for each canonical `CITIES`
entry, use `loadCity` with deterministic sampling (`random: () => .5`), decode in a
browser, and inspect accepted images. Keep credentials in a server/CLI audit
process if needed, never in a browser harness. Update this table, the audit JSON,
and `coverage.mjs` together only after successful requests. Recheck the narrow
exceptions against their source images if those records change.
