import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, filterCities, normalizeCandidates, deduplicate, chooseMaps, createDeck, MemoryGame, LatestRequest } from '../core.mjs';
import { searchUrl, loadCity, collectUsable, preloadThumbnail } from '../api.mjs';
const maps = Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: `Map ${i}`, thumbnailUrl: `https://geo.btaa.org/api/v1/thumbnails/${i}` }));
const chicago = CITIES[0];
const record = (i, overrides = {}) => ({ id: String(i), attributes: { ogm: { dct_title_s: `Chicago map ${i}`, gbl_resourceClass_sm: ['Maps'], dct_spatial_sm: ['Illinois--Chicago'], dcat_bbox: '-87.9,41.6,-87.5,42', ...overrides } }, meta: { ui: { thumbnail_url: `https://geo.btaa.org/api/v1/thumbnails/${i}` } } });
const controller = () => new AbortController();

test('city picker has 26 canonical choices, aliases, and separate search labels', () => {
  assert.equal(CITIES.length, 26);
  assert.equal(filterCities('NYC')[0].term, 'New York');
  assert.equal(filterCities('dc')[0].label, 'Washington, DC');
  assert.equal(filterCities('california').length, 3);
  assert.deepEqual(filterCities('not a city'), []);
});
test('deck contains exactly two of each map and shuffles without mutating the input', () => {
  const deck = createDeck(maps, () => 0);
  assert.equal(deck.length, 16);
  assert.equal(new Set(deck.map(card => card.key)).size, 16);
  for (const map of maps) assert.equal(deck.filter(card => card.map.id === map.id).length, 2);
  assert.equal(maps[0].id, '0');
  assert.notEqual(deck[0].key, '0:0');
  assert.throws(() => createDeck(maps.slice(0, 3)));
  assert.throws(() => createDeck([...maps.slice(0, 3), maps[0]]));
  assert.equal(createDeck(maps.slice(0, 4)).length, 8);
});
test('new maps guarantees a changed selection when additional maps exist', () => {
  const pool = [...maps, { id: 'new' }];
  assert(chooseMaps(pool, maps, () => .5).some(map => map.id === 'new'));
});
test('relevance excludes publisher-only mentions, distant railways, and statewide maps', () => {
  const payload = { data: [record(0), record(1, { dct_title_s: 'Paris map', dct_spatial_sm: ['France'], dct_publisher_sm: ['Chicago Press'] }), record(2, { dcat_bbox: '-125,29,-87,50' }), record(3, { dcat_bbox: '-122,37,-121,38' })] };
  assert.deepEqual(normalizeCandidates(payload, chicago).map(map => map.id), ['0']);
  const ny = CITIES.find(city => city.id === 'new-york');
  assert.equal(normalizeCandidates({ data: [record(4, { dct_title_s: 'New York', dct_spatial_sm: ['New York'], dcat_bbox: '-80,40,-71,45' }), record(5, { dct_title_s: 'West New York', dct_spatial_sm: ['New Jersey'], dcat_bbox: '-74.024,40.778,-73.998,40.797' })] }, ny).length, 0);
});
test('deduplication rejects repeated IDs, URLs, and normalized titles', () => {
  assert.equal(deduplicate([maps[0], { ...maps[1], id: '0' }, { ...maps[2], title: 'MAP 0.' }, { ...maps[3], thumbnailUrl: maps[0].thumbnailUrl }, maps[4]]).length, 2);
});
test('pair matching, repeated activation, and completion', () => {
  let announcement = '';
  const game = new MemoryGame(message => { announcement = message; });
  game.reset(maps.slice(0, 4), () => .999);
  game.flip(0); game.flip(0); assert.equal(game.moves, 0); assert.deepEqual(game.open, [0]);
  game.flip(1); assert.equal(game.matched.size, 1); assert.equal(game.moves, 1);
  game.flip(0); assert.deepEqual(game.open, []);
  for (let i = 2; i < 8; i++) game.flip(i);
  assert.equal(game.complete, true); assert.equal(game.moves, 4); assert.match(announcement, /All 4 pairs/);
});
test('mismatch stays visible for 1100ms and blocks a third card', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const game = new MemoryGame(() => {}); game.reset(maps, () => .999);
  game.flip(0); game.flip(2); game.flip(4);
  assert.deepEqual(game.open, [0, 2]); assert.equal(game.moves, 1);
  context.mock.timers.tick(1099); assert.deepEqual(game.open, [0, 2]);
  context.mock.timers.tick(1); assert.deepEqual(game.open, []);
  game.flip(4); assert.deepEqual(game.open, [4]);
});
test('reset clears moves, matches, and pending mismatch timer', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const game = new MemoryGame(() => {}); game.reset(maps, () => .999);
  game.flip(0); game.flip(1); game.flip(2); game.flip(4);
  game.reset(maps, () => .999); game.flip(6);
  context.mock.timers.tick(1200);
  assert.equal(game.moves, 0); assert.equal(game.matched.size, 0); assert.deepEqual(game.open, [6]);
});
test('a slow previous city cannot commit or report an error after a city switch', async () => {
  const latest = new LatestRequest(); let release, oldSignal, disposed = false; const commits = [], failures = [];
  const slow = latest.run(signal => { oldSignal = signal; return new Promise(resolve => { release = resolve; }); }, value => commits.push(value), error => failures.push(error));
  await latest.run(async () => 'Seattle', value => commits.push(value), error => failures.push(error));
  release({ dispose: () => { disposed = true; } }); await slow;
  assert(oldSignal.aborted); assert(disposed); assert.deepEqual(commits, ['Seattle']); assert.equal(failures.length, 0);
  let rejectOld;
  const failure = latest.run(() => new Promise((_, reject) => { rejectOld = reject; }), value => commits.push(value), error => failures.push(error));
  await latest.run(async () => 'NYC', value => commits.push(value), error => failures.push(error));
  rejectOld(new Error('stale')); await failure;
  assert.equal(failures.length, 0); assert.deepEqual(commits, ['Seattle', 'NYC']);
});
test('search uses the live map filter and title contract; fallback remains city-specific', () => {
  const primary = new URL(searchUrl(chicago));
  assert.equal(primary.searchParams.get('include_filters[gbl_resourceClass_sm][]'), 'Maps');
  assert.equal(JSON.parse(primary.searchParams.get('adv_q'))[0].f, 'dct_title_s');
  assert.match(new URL(searchUrl(chicago, true)).searchParams.get('q'), /Chicago.*Illinois/);
});
test('unloadable and duplicate images are excluded; insufficient pools stay small', async () => {
  let disposed = 0;
  const pool = await collectUsable(maps, controller().signal, async map => {
    if (map.id === '0') throw new Error('broken image');
    if (map.id === '1') return null;
    return { ...map, hash: Number(map.id) < 4 ? 'same' : map.id, dispose: () => disposed++ };
  });
  assert.equal(pool.length, 5); assert.equal(disposed, 1);
});
test('SVG placeholders are rejected before image decoding', async () => {
  const result = await preloadThumbnail(maps[0], controller().signal, async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }));
  assert.equal(result, null);
});
for (const count of [3, 4, 7, 8]) {
  test(`mock API with ${count} usable thumbnails ${count < 8 ? 'tries fallback' : 'finishes primary search'}`, async () => {
    const urls = [];
    const result = await loadCity(chicago, controller().signal, {
      fetcher: async url => { urls.push(url); return new Response(JSON.stringify({ data: Array.from({ length: 12 }, (_, i) => record(i)) })); },
      preload: async map => Number(map.id) < count ? { ...map, hash: map.id } : null,
      random: () => .5,
    });
    assert.equal(result.pool.length, count); assert.equal(urls.length, count < 8 ? 2 : 1);
    if (count < 4) assert.throws(() => createDeck(result.pool));
    else assert.equal(createDeck(result.pool).length, count * 2);
  });
}
test('API failure is actionable and abort cannot return a deck', async () => {
  await assert.rejects(loadCity(chicago, controller().signal, { fetcher: async () => new Response('', { status: 429 }) }), /Wait a minute/);
  const aborted = controller(); aborted.abort();
  await assert.rejects(collectUsable(maps, aborted.signal, async map => map), { name: 'AbortError' });
});

test('atlas covers and brochures do not become playable map thumbnails', () => {
  assert.equal(normalizeCandidates({ data: [record(0, { dct_title_s: 'Chicago atlas volume 1' }), record(1, { dct_title_s: 'Chicago real estate brochure' })] }, chicago).length, 0);
});
test('fallback contributes new maps without reintroducing duplicate titles', async () => {
  let calls = 0;
  const result = await loadCity(chicago, controller().signal, {
    fetcher: async () => {
      const data = calls++ === 0 ? [record(0), record(1), record(2)] : [record(99, { dct_title_s: 'Chicago map 0' }), ...Array.from({ length: 8 }, (_, i) => record(i))];
      return new Response(JSON.stringify({ data }));
    },
    preload: async map => ({ ...map, hash: map.id }),
  });
  assert.equal(calls, 2);
  assert.equal(result.pool.length, 8);
  assert(!result.pool.some(map => map.id === '99'));
});
test('near-identical pixel samples cannot become different playable pairs', async () => {
  let released = 0;
  const pool = await collectUsable(maps.slice(0, 3), controller().signal, async map => ({
    ...map, hash: map.id, pixels: [0, 0, map.id === '2' ? 240 : 1], dispose: () => released++,
  }));
  assert.equal(pool.length, 2); assert.equal(released, 1);
});
test('cancellation releases thumbnails decoded by in-flight workers', async () => {
  const aborted = controller(); let released = 0;
  await assert.rejects(collectUsable(maps.slice(0, 4), aborted.signal, async map => {
    aborted.abort(); return { ...map, hash: map.id, dispose: () => released++ };
  }), { name: 'AbortError' });
  assert.equal(released, 4);
});
test('lightbox pauses mismatch timing and resumes without changing the move count', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const game = new MemoryGame(() => {}); game.reset(maps, () => .999);
  game.flip(0); game.flip(2); context.mock.timers.tick(200); game.pause();
  context.mock.timers.tick(5000); game.flip(4);
  assert.deepEqual(game.open, [0, 2]); assert.equal(game.moves, 1);
  game.resume(); context.mock.timers.tick(1099); assert.deepEqual(game.open, [0, 2]);
  context.mock.timers.tick(1); assert.deepEqual(game.open, []);
});
test('full viewer and metadata preserve safe record URLs and source fields', () => {
  const [map] = normalizeCandidates({ data: [record(0, { dct_creator_sm: ['Cartographer'], dct_rights_sm: ['Public domain'], dct_description_sm: ['City street map'] })] }, chicago);
  assert.equal(map.creator, 'Cartographer'); assert.equal(map.rights, 'Public domain');
  assert.equal(map.description, 'City street map');
  assert.equal(map.viewerUrl, 'https://geo.btaa.org/api/v1/resources/0/ogm-viewer?embed=true');
});

test('every BTAA member state has a major urban area in the city picker', () => {
  // Current university and member-library rosters, checked November 12, 2026:
  // https://btaa.org/about/member-universities
  // https://btaa.org/library/who-we-are/member-libraries
  const representatives = {
    CA: 'los-angeles', IL: 'chicago', IN: 'indianapolis', IA: 'des-moines',
    MD: 'baltimore', MI: 'detroit', MN: 'minneapolis', NE: 'omaha', NJ: 'newark',
    OH: 'columbus', OR: 'portland', PA: 'philadelphia', WA: 'seattle', WI: 'milwaukee',
  };
  for (const [state, id] of Object.entries(representatives)) {
    const city = CITIES.find(city => city.id === id && city.state === state);
    assert(city, `${state} needs its representative city`);
    assert(filterCities(city.stateName).some(match => match.id === id));
    assert.equal(new URL(searchUrl(city, true)).searchParams.get('q'), `"${city.term}" "${city.stateName}" map`);
  }
  assert.equal(filterCities('Indy')[0].id, 'indianapolis');
  assert.equal(new Set(CITIES.map(city => city.id)).size, CITIES.length);
});
