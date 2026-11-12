import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CITIES, createDeck } from '../core.mjs';
import { loadCity, preloadThumbnail, reviewCandidates } from '../api.mjs';
import { REVIEWED_MAPS } from '../reviewed-maps.mjs';
const review = JSON.parse(await readFile(new URL('../visual-review.json', import.meta.url)));
const signal = () => new AbortController().signal;

test('every runtime approval matches a positive visual decision and exact image digest', () => {
  assert.deepEqual(Object.keys(REVIEWED_MAPS), CITIES.map(city => city.id));
  for (const city of review.cities) {
    for (const [id, hash] of Object.entries(REVIEWED_MAPS[city.id])) {
      const image = city.images.find(image => image.id === id);
      assert.equal(image?.decision, 'approved', `${city.id}/${id}`);
      assert.equal(hash, image.sha256);
      assert.match(hash, /^[a-f0-9]{64}$/);
    }
    for (const image of city.images.filter(image => image.decision === 'excluded')) {
      assert.equal(REVIEWED_MAPS[city.id][image.id], undefined, image.id);
    }
  }
});

test('Philadelphia text sheets and skyline illustration cannot enter a playable pool', () => {
  const ids = Array.from({ length: 6 }, (_, i) => `pst_0039864243_${33503 + i}`);
  ids.push('princeton-ht24wm852');
  assert.equal(reviewCandidates(ids.map(id => ({ id })), 'philadelphia').length, 0);
  for (const id of ids) assert.equal(review.cities.find(c => c.id === 'philadelphia').images.find(m => m.id === id).decision, 'excluded');
});

test('approval is city-specific and unknown records are excluded even with plausible map metadata', () => {
  const id = Object.keys(REVIEWED_MAPS.chicago)[0];
  assert.equal(reviewCandidates([{ id }], 'chicago').length, 1);
  assert.equal(reviewCandidates([{ id }], 'philadelphia').length, 0);
  assert.equal(reviewCandidates([{ id: 'new-map-with-text-preview' }], 'chicago').length, 0);
});

test('missing image approval skips the network; changed bytes are rejected before decoding', async () => {
  let requests = 0;
  const fetcher = async () => { requests++; return new Response('a text-page image replaced the map', { headers: { 'Content-Type': 'image/jpeg' } }); };
  assert.equal(await preloadThumbnail({ thumbnailUrl: 'https://geo.btaa.org/api/v1/thumbnails/test' }, signal(), fetcher), null);
  assert.equal(requests, 0);
  const reviewedHash = createHash('sha256').update('the previously reviewed map image').digest('hex');
  assert.equal(await preloadThumbnail({ thumbnailUrl: 'https://geo.btaa.org/api/v1/thumbnails/test', reviewedHash }, signal(), fetcher), null);
  assert.equal(requests, 1);
});

test('unreviewed search hits cannot fill an insufficient three-map deck or consume thumbnail requests', async () => {
  const city = CITIES.find(city => city.id === 'philadelphia');
  const records = Array.from({ length: 12 }, (_, i) => ({
    id: String(i), attributes: { ogm: { dct_title_s: `Philadelphia map ${i}`, gbl_resourceClass_sm: ['Maps'], dct_spatial_sm: ['Philadelphia'], dcat_bbox: '-75.3,39.8,-74.9,40.2' } },
  }));
  const reviewed = { philadelphia: Object.fromEntries(records.slice(0, 3).map(record => [record.id, 'a'.repeat(64)])) };
  let searches = 0; const preloaded = [];
  const result = await loadCity(city, signal(), {
    reviewed, random: () => .9,
    fetcher: async () => { searches++; return Response.json({ data: records }); },
    preload: async map => { preloaded.push(map.id); return { ...map, hash: map.id }; },
  });
  assert.equal(searches, 3);
  assert.deepEqual(preloaded, ['0', '1', '2']);
  assert.equal(result.pool.length, 3);
  assert.throws(() => createDeck(result.pool));
});
