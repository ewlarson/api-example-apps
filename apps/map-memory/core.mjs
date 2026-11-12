// Pure game and selection logic; also used by the dependency-free Node tests.
export const CITIES = [
  ['chicago', 'Chicago', 'IL', 'Illinois', 41.88, -87.63],
  ['san-francisco', 'San Francisco', 'CA', 'California', 37.77, -122.42, ['SF']],
  ['seattle', 'Seattle', 'WA', 'Washington', 47.61, -122.33],
  ['new-york', 'New York City', 'NY', 'New York', 40.71, -74.01, ['NYC'], 'New York'],
  ['los-angeles', 'Los Angeles', 'CA', 'California', 34.05, -118.24, ['LA']],
  ['houston', 'Houston', 'TX', 'Texas', 29.76, -95.37],
  ['philadelphia', 'Philadelphia', 'PA', 'Pennsylvania', 39.95, -75.16, ['Philly']],
  ['boston', 'Boston', 'MA', 'Massachusetts', 42.36, -71.06],
  ['washington', 'Washington', 'DC', 'District of Columbia', 38.91, -77.04, ['DC', 'Washington DC']],
  ['atlanta', 'Atlanta', 'GA', 'Georgia', 33.75, -84.39],
  ['austin', 'Austin', 'TX', 'Texas', 30.27, -97.74],
  ['baltimore', 'Baltimore', 'MD', 'Maryland', 39.29, -76.61],
  ['columbus', 'Columbus', 'OH', 'Ohio', 39.96, -83.00],
  ['dallas', 'Dallas', 'TX', 'Texas', 32.78, -96.80],
  ['denver', 'Denver', 'CO', 'Colorado', 39.74, -104.99],
  ['des-moines', 'Des Moines', 'IA', 'Iowa', 41.59, -93.62],
  ['detroit', 'Detroit', 'MI', 'Michigan', 42.33, -83.05],
  ['indianapolis', 'Indianapolis', 'IN', 'Indiana', 39.77, -86.16, ['Indy']],
  ['miami', 'Miami', 'FL', 'Florida', 25.76, -80.19],
  ['milwaukee', 'Milwaukee', 'WI', 'Wisconsin', 43.04, -87.91],
  ['minneapolis', 'Minneapolis', 'MN', 'Minnesota', 44.98, -93.27],
  ['new-orleans', 'New Orleans', 'LA', 'Louisiana', 29.95, -90.07, ['NOLA']],
  ['newark', 'Newark', 'NJ', 'New Jersey', 40.74, -74.17],
  ['omaha', 'Omaha', 'NE', 'Nebraska', 41.26, -95.94],
  ['portland', 'Portland', 'OR', 'Oregon', 45.52, -122.68],
  ['san-diego', 'San Diego', 'CA', 'California', 32.72, -117.16],
].map(([id, name, state, stateName, lat, lon, aliases = [], term = name]) =>
  ({ id, name, state, stateName, lat, lon, aliases, term, label: `${name}, ${state}` }));

export const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Inspected live thumbnails: a folded map's cover and a world map mis-bounded to SF.
const NON_MAP_THUMBNAILS = new Set(['stanford-hm701yz9300', 'eacef6c9-3b5a-41e0-83ee-098d84947ad9']);
const text = (value) => Array.isArray(value) ? value.join(', ') : String(value ?? '');
export function filterCities(query) {
  const needle = normalize(query);
  return CITIES.filter(city => [city.label, city.stateName, ...city.aliases].some(value => normalize(value).includes(needle)));
}

export function normalizeCandidates(payload, city) {
  return (payload.data || []).flatMap(record => {
    if (NON_MAP_THUMBNAILS.has(record.id)) return [];
    const ogm = record.attributes?.ogm || {};
    const title = text(ogm.dct_title_s);
    const spatial = text(ogm.dct_spatial_sm);
    // Multi-sheet atlas/insurance volumes often thumbnail the binding, not a map.
    if (/\b(volume|vol|atlas|brochure)\b/i.test(title)) return [];
    const cityTerm = normalize(city.term);
    if (city.id === 'new-york' && /\bwest new york\b/i.test(title)) return [];
    // Never use publisher/provider/description mentions as evidence of place.
    const hasCity = (` ${normalize(title)} `).includes(` ${cityTerm} `);
    const placeCity = (` ${normalize(spatial)} `).includes(` ${cityTerm} `);
    if (!record.id || !title || !ogm.gbl_resourceClass_sm?.includes('Maps') || !(hasCity || placeCity)) return [];
    const bbox = text(ogm.dcat_bbox).split(',').map(Number);
    const validBox = bbox.length === 4 && bbox.every(Number.isFinite) && bbox[2] > bbox[0] && bbox[3] > bbox[1];
    if (validBox) {
      const [west, south, east, north] = bbox;
      // Exclude state/national maps and maps of distant places with city-name railways.
      if (east - west > 2 || north - south > 2 || city.lon < west - .2 || city.lon > east + .2 || city.lat < south - .2 || city.lat > north + .2) return [];
    } else if (!hasCity || !placeCity) return [];
    const thumbnailUrl = record.meta?.ui?.thumbnail_url || `https://geo.btaa.org/api/v1/resources/${encodeURIComponent(record.id)}/thumbnail`;
    if (/placeholder|static.map|\.svg(?:\?|$)/i.test(thumbnailUrl)) return [];
    // Cached thumbnails only from the public API; never execute metadata URLs.
    if (!/^https:\/\/geo\.btaa\.org\/api\/v1\/(thumbnails\/|resources\/[^/]+\/thumbnail)/.test(thumbnailUrl)) return [];
    const score = (hasCity ? 10 : 0) + (/pictorial|bird.s.eye|tour|park|geolog|exposition|harbo[u]?r/i.test(title) ? 5 : 0)
      - (/insurance|volume|sheet|quadrangle/i.test(title) ? 3 : 0);
    return [{ id: String(record.id), title, thumbnailUrl, score,
      description: text(ogm.dct_description_sm), creator: text(ogm.dct_creator_sm),
      rights: text(ogm.dct_rights_sm), spatial,
      viewerUrl: `https://geo.btaa.org/api/v1/resources/${encodeURIComponent(record.id)}/ogm-viewer?embed=true`,
      date: text(ogm.dct_temporal_sm) || text(ogm.dct_issued_s) || text(ogm.gbl_indexYear_im),
      institution: text(ogm.schema_provider_s),
      recordUrl: `https://geo.btaa.org/resources/${encodeURIComponent(record.id)}` }];
  }).sort((a, b) => b.score - a.score);
}

export function deduplicate(resources) {
  const ids = new Set(), titles = new Set(), urls = new Set();
  return resources.filter(resource => {
    const title = normalize(resource.title).replace(/\b(cartographic material|volume \w+|vol \w+)\b/g, '').trim();
    if (ids.has(resource.id) || titles.has(title) || urls.has(resource.thumbnailUrl)) return false;
    ids.add(resource.id); titles.add(title); urls.add(resource.thumbnailUrl);
    return true;
  });
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function chooseMaps(pool, previous = [], random = Math.random) {
  const old = new Set(previous.map(map => map.id));
  const fresh = shuffle(pool.filter(map => !old.has(map.id)), random);
  return [...fresh, ...shuffle(pool.filter(map => old.has(map.id)), random)].slice(0, 8);
}
export function createDeck(maps, random = Math.random) {
  if (maps.length < 4 || maps.length > 8 || new Set(maps.map(map => map.id)).size !== maps.length) {
    throw new Error('A game needs four to eight distinct maps.');
  }
  return shuffle(maps.flatMap(map => [0, 1].map(copy => ({ key: `${map.id}:${copy}`, map }))), random);
}

export class MemoryGame {
  constructor(onChange, { delay = 1100, schedule = (fn, ms) => setTimeout(fn, ms), cancel = timer => clearTimeout(timer) } = {}) {
    Object.assign(this, { onChange, delay, schedule, cancel, timer: null, deck: [], open: [], matched: new Set(), moves: 0 });
  }
  reset(maps = [], random = Math.random) {
    this.cancel(this.timer);
    this.timer = null; this.paused = false;
    this.deck = maps.length ? createDeck(maps, random) : [];
    this.open = []; this.matched = new Set(); this.moves = 0;
    this.onChange('');
  }
  pause() { this.paused = true; this.cancel(this.timer); this.timer = null; }
  resume() {
    this.paused = false;
    if (this.open.length === 2) this.resolveMismatch();
  }
  resolveMismatch() {
    this.timer = this.schedule(() => {
      this.timer = null; this.open = []; this.onChange('Cards turned back. Choose another pair.');
    }, this.delay);
  }
  get complete() { return this.deck.length > 0 && this.matched.size === this.deck.length / 2; }
  flip(index) {
    const card = this.deck[index];
    if (this.paused || !card || this.open.length === 2 || this.open.includes(index) || this.matched.has(card.map.id)) return;
    this.open.push(index);
    if (this.open.length === 1) { this.onChange(`Revealed ${card.map.title}.`); return; }
    this.moves++;
    if (this.deck[this.open[0]].map.id === card.map.id) {
      this.matched.add(card.map.id); this.open = [];
      this.onChange(this.complete ? `All ${this.matched.size} pairs found in ${this.moves} moves!` : `Match: ${card.map.title}.`);
    } else {
      this.onChange('No match. Remember these maps.');
      this.resolveMismatch();
    }
  }
}

// Abort for efficiency; generation check also protects against loaders that ignore abort.
export class LatestRequest {
  generation = 0;
  cancel() { this.controller?.abort(); this.generation++; }
  async run(loader, commit, fail) {
    this.cancel();
    const generation = this.generation;
    const controller = this.controller = new AbortController();
    try {
      const result = await loader(controller.signal);
      if (generation === this.generation) commit(result);
      else result?.dispose?.();
    } catch (error) {
      if (generation === this.generation && error.name !== 'AbortError') fail(error);
    }
  }
}
