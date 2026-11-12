import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, normalizeCandidates, deduplicate, filterCities } from '../core.mjs';
import { isBlankOrMask, REVIEWED_IMAGES } from '../quality.mjs';
import { loadCity, collectUsable, ApiError, searchUrl, imagesSimilar } from '../api.mjs';
import { availabilityLabel, suggestedCities, playableCities, COVERAGE } from '../coverage.mjs';
const city = id => CITIES.find(value => value.id === id);
const record = (id, title, bbox, spatial = [], extra = {}) => ({ id, attributes: { ogm: {
  dct_title_s: title, dcat_bbox: bbox, dct_spatial_sm: spatial, gbl_resourceClass_sm: ['Maps'], ...extra,
} } });
const candidates = (records, id) => normalizeCandidates({ data: records }, city(id));

test('audited raster index masks and insurance-volume covers are excluded by metadata', () => {
  assert.equal(candidates([record('stanford-cb647xy7216', 'El Cajon, San Diego Co., Cal., May 1929, Maps Index', '-117,32.7,-116.9,32.9')], 'san-diego').length, 0);
  assert.equal(candidates([record('c36a1663-e55e-4ac7-acc4-83f03f640e90', 'Philadelphia, Pennsylvania, 1916', '-75.28,39.86,-74.95,40.13', ['Philadelphia'], { dct_description_sm: ['Insurance maps of Philadelphia, Pennsylvania, Vol.3, 1916. 1 map in 28 vols.'] })], 'philadelphia').length, 0);
});
test('only reviewed Omaha city sheets can bypass statewide bounding boxes', () => {
  const box = '-104.053,40,-95.308,43.001';
  const maps = candidates([
    record('RUMSEY_8_1_29076_1130181', 'Omaha City, Nebraska North.', box, ['Nebraska']),
    record('RUMSEY_8_1_28917_11305', 'Omaha, Winnebago reservation lands, Nebraska', box, ['Nebraska']),
    record('unreviewed', 'Omaha map', box, ['Nebraska']),
  ], 'omaha');
  assert.deepEqual(maps.map(map => map.id), ['RUMSEY_8_1_29076_1130181']);
  assert.equal(candidates([record('RUMSEY_8_1_29076_1130181', 'Omaha City, Nebraska North.', box)], 'chicago').length, 0);
});
test('statewide Ohio map is rejected even with misleading local bounds and subjects', () => {
  assert.equal(candidates([record('osu-3b591q16z', 'Ohio landform map', '-83.080,39.991,-83.007,40.075', ['Ohio--Columbus'])], 'columbus').length, 0);
});
test('reviewed IIIF map sheets require the matching manifest in the live API record', () => {
  const id = 'stanford-kq516ks6538';
  const source = record(id, 'Automobile road map touring San Diego county California', '-117.5,32.5,-116.5,33.5', ['San Diego']);
  assert.equal(candidates([source], 'san-diego').length, 0);
  source.attributes.ogm.dct_references_s = JSON.stringify({ 'http://iiif.io/api/presentation#manifest': REVIEWED_IMAGES[id].manifest });
  const [map] = candidates([source], 'san-diego');
  assert.equal(map.thumbnailUrl, REVIEWED_IMAGES[id].url);
  assert.match(map.previewNote, /page 2/);
  source.attributes.ogm.dct_references_s = '{broken';
  assert.equal(candidates([source], 'san-diego').length, 0);
});
test('raster silhouettes and blank sheets fail while textured maps pass', () => {
  const black = [0, 0, 0], white = [255, 255, 255];
  assert(isBlankOrMask(Array.from({ length: 100 }, (_, i) => i < 40 ? black : white).flat()));
  assert(isBlankOrMask(Array(100).fill(white).flat()));
  assert(!isBlankOrMask(Array.from({ length: 100 }, (_, i) => [80 + i, 90 + i, 70 + i]).flat()));
  // A mostly white line map is not the large solid-black silhouette case.
  assert(!isBlankOrMask(Array.from({ length: 100 }, (_, i) => i < 5 ? black : white).flat()));
});
test('visually repeated exposition scans count as one map even with different titles', () => {
  const maps = candidates([
    record('p16022coll205:605', 'Exposition map of the city of New Orleans', '-90.15,29.9,-90.01,30.03'),
    record('p16022coll205:606', "The World's Industrial and Cotton Centennial Exposition, New Orleans", '-90.16,29.9,-89.99,30.03'),
  ], 'new-orleans');
  assert.equal(deduplicate(maps).length, 1);
});
test('geographic fallback stays bounded to the selected city', () => {
  const url = new URL(searchUrl(city('milwaukee'), 'nearby'));
  assert.equal(url.searchParams.get('include_filters[geo][distance]'), '25km');
  assert.equal(url.searchParams.get('include_filters[geo][center][lat]'), '43.04');
  assert.equal(url.searchParams.get('include_filters[gbl_resourceClass_sm][]'), 'Maps');
});
test('thumbnail rate limits are errors, not evidence that a city has no maps', async () => {
  let disposed = 0;
  await assert.rejects(collectUsable([{ id: 'ok' }, { id: 'limit' }], new AbortController().signal, async map => {
    if (map.id === 'limit') throw new ApiError(429);
    return { ...map, dispose: () => disposed++ };
  }), error => error.status === 429);
  assert.equal(disposed, 1);
});
test('failed thumbnail requests are reported separately from rejected images', async () => {
  const diagnostics = { checked: 0, rejected: 0, failed: 0, timedOut: 0 };
  const maps = await collectUsable([{ id: 'missing' }, { id: 'timeout' }], new AbortController().signal, async map => {
    if (map.id === 'missing') return null;
    throw new DOMException('Slow host', 'TimeoutError');
  }, [], diagnostics);
  assert.equal(maps.length, 0);
  assert.deepEqual(diagnostics, { checked: 2, rejected: 1, failed: 1, timedOut: 1 });
});
test('an already playable pool survives a later search rate limit with a warning', async () => {
  let calls = 0;
  const data = Array.from({ length: 4 }, (_, i) => record(String(i), `Chicago map ${i}`, '-87.9,41.6,-87.5,42'));
  const result = await loadCity(city('chicago'), new AbortController().signal, {
    fetcher: async () => calls++ === 0 ? Response.json({ data }) : new Response('', { status: 429 }),
    preload: async map => ({ ...map, hash: map.id }),
  });
  assert.equal(result.pool.length, 4);
  assert.match(result.warning, /limit/);
});
test('availability labels distinguish missing, small and full decks; alternatives are playable', () => {
  assert.match(availabilityLabel(0), /Not enough/);
  assert.match(availabilityLabel(3), /Not enough/);
  assert.match(availabilityLabel(4), /smaller board/);
  assert.match(availabilityLabel(20), /8 pairs/);
  const suggestions = suggestedCities(city('des-moines'), CITIES, { chicago: 8, minneapolis: 10, milwaukee: 2 });
  assert.deepEqual(new Set(suggestions.map(value => value.id)), new Set(['chicago', 'minneapolis']));
});

test('similar paper colors do not collapse different map structures', () => {
  const a = [210, 220, 210, 220].flatMap(n => [n, n - 5, n - 10]);
  const b = [220, 210, 220, 210].flatMap(n => [n, n - 5, n - 10]);
  assert.equal(imagesSimilar(a, b), false);
  assert.equal(imagesSimilar(a, a.map(n => n + 5)), true);
  assert.equal(imagesSimilar(a, [...a]), true);
});
test('Sanborn cover and index identifiers are rejected even when the title says sheet', () => {
  assert.equal(candidates([record('02371_1898_Ind1_1j92g7804', 'Sanborn Map [Indiana--Indianapolis] {1898} sheet', '-86.2,39.7,-86.1,39.8')], 'indianapolis').length, 0);
  assert.equal(candidates([record('02371_1898_Cov_pg15bf171', 'Sanborn Map [Indiana--Indianapolis] {1898} sheet', '-86.2,39.7,-86.1,39.8')], 'indianapolis').length, 0);
});

test('multi-part route maps must depict the city on this sheet, not another segment', () => {
  assert.equal(candidates([record('route', 'Automobile route from Los Angeles to Lake Tahoe. Part two, Haiwee to Mono Lake', '-118.5,33.9,-118,34.2')], 'los-angeles').length, 0);
  assert.equal(candidates([record('route', 'Automobile road from Los Angeles to San Diego. Part three, Oceanside to San Diego', '-117.3,32.6,-117,33')], 'san-diego').length, 1);
});

test('reviewed Columbus quadrangle is local while unreviewed statewide bounds stay excluded', () => {
  const box = '-84.820,38.403,-80.519,42.323';
  assert.equal(candidates([record('osu-dz0114110', 'Quaternary geology of Ohio, Columbus quadrangle', box)], 'columbus').length, 1);
  assert.equal(candidates([record('unreviewed-ohio', 'Columbus geological map', box)], 'columbus').length, 0);
});

test('picker only offers audited cities with at least four playable maps', () => {
  const choices = playableCities(CITIES, COVERAGE);
  assert.equal(choices.length, 20);
  for (const id of ['atlanta', 'denver', 'des-moines', 'miami', 'milwaukee', 'new-orleans']) {
    assert(!choices.some(city => city.id === id));
    assert.equal(filterCities(city(id).name, choices).length, 0);
  }
  assert(choices.some(city => city.id === 'columbus'));
  assert.deepEqual(playableCities(CITIES, { chicago: 3, milwaukee: 4 }).map(city => city.id), ['milwaukee']);
  assert.deepEqual(playableCities(CITIES, {}).map(city => city.id), []);
});
