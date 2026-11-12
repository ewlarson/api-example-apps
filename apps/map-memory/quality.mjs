// Reviewed November 12, 2026. These are source-quality exceptions, not extra maps.
// Every playable image still comes from the live API and must decode successfully.
export const REJECTED_PREVIEWS = new Set([
  'stanford-cb002hm8300', // Clason's Los Angeles guide: illustrated cover.
  'stanford-ht948tt2809', // Pasadena automobile map: title/cover page.
  'stanford-zn128qg5660', // San Diego routes: title/cover page.
  'stanford-kq516ks6538', // San Diego automobile map: title/cover page.
  'stanford-mc601rm3983', // San Francisco guide binding.
  'stanford-wr561yx8346', // Los Angeles automobile map cover.
  'stanford-bn203sw3391', // Los Angeles automobile map cover.
  'p16022coll205:1125', // Old Boston binding.
  '5fa65533-d377-41a9-881c-56250826c4ef', // Horizon-level city engraving, not a map.
  'p16022coll205:416', // King plats title page.
  '6608f973-16a8-4a12-ac46-36e9935d0055', // Regional war map, not a Philadelphia city map.
  'osu-3b591q16z', // Statewide Ohio landforms with misleading local subjects/bounds.
]);

// Only individually reviewed city maps may override coarse catalog bounds.
export const REVIEWED_BOUNDS = { ...Object.fromEntries([
  'RUMSEY_8_1_29076_1130181', 'RUMSEY_8_1_29077_1130182',
  'RUMSEY_8_1_29078_1130183', 'RUMSEY_8_1_29079_1130184',
  'RUMSEY_8_1_290385_90062026', 'RUMSEY_8_1_314989_90083884',
  'RUMSEY_8_1_314988_90083885',
].map(id => [id, 'omaha'])),
  'osu-dz0114110': 'columbus', // Columbus geological quadrangle, cataloged with Ohio-wide bounds.
};

const VISUAL_GROUPS = [
  ['chicago-topographic', ['942340b0-82d4-0134-1f08-0050569601ca-b', 'a2d29ca0-994e-0134-2096-0050569601ca-6']],
  ['boston-topography', ['stanford-fk383br7533', 'princeton-n870zx16m', 'p16022coll205:526']],
  ['boston-street-plan', ['p16022coll205:289', 'p16022coll205:282']],
  ['boston-city-plan', ['p16022coll205:301', 'p16022coll205:309']],
  ['washington-ornate-plan', ['p16022coll230:1551', 'p16022coll230:1536']],
  ['baltimore-harford', ['cb1d7899-05bc-4d18-ae96-ed3a0fcca395', '59c0e7f8-1d65-4ec0-99fd-2517801fb48f']],
  ['minneapolis-park-system', ['mdl-1r7izL5rFAhi', 'mdl-MAi0zWCwmvvG', 'p16022coll55-id-1743', 'p16022coll55-id-1728', 'p16022coll55-id-1742', 'p16022coll55-id-1748', 'p16022coll55-id-152', 'p16022coll55-id-1753']],
  ['portland-environs', ['p16022coll205:655', 'p16022coll205:666']],
  ['san-diego-mission-route', ['stanford-ph085jq0580', 'stanford-nk930kb3057']],
];

export function visualGroup(id, title) {
  const reviewed = VISUAL_GROUPS.find(([, ids]) => ids.includes(id));
  if (reviewed) return reviewed[0];
  if (['p16022coll205:605', 'p16022coll205:606', '72395245-25eb-4cc3-8c23-9971c5c80560'].includes(id)) return 'new-orleans-exposition-plan';
  if (/boston quadrangle/i.test(title)) return 'boston-quadrangle';
  if (/boston and vicinity/i.test(title) && /topograph|^massachusetts\s*:/i.test(title)) return 'boston-topography';
  if (/^(?:map of )?minneapolis park system|^park system city of minneapolis/i.test(title)) return 'minneapolis-park-system';
  if (/the university of texas at austin/i.test(title)) return 'austin-campus-plan';
  return null;
}

// Raster masks can return HTTP 200 and image/jpeg, just like genuine maps.
// Sample RGB triplets after compositing transparency onto white.
export function isBlankOrMask(pixels) {
  if (!pixels?.length) return false;
  let black = 0, white = 0;
  const count = pixels.length / 3;
  for (let i = 0; i < pixels.length; i += 3) {
    const low = Math.min(...pixels.slice(i, i + 3)), high = Math.max(...pixels.slice(i, i + 3));
    if (high < 16) black++;
    if (low > 239) white++;
  }
  return black / count > .98 || white / count > .98
    || (black / count > .12 && white / count > .12 && (black + white) / count > .94);
}

// The API thumbnails for these records show covers. Page 2 of each API-linked
// IIIF manifest was visually checked; use that map sheet instead of the cover.
export const REVIEWED_IMAGES = Object.fromEntries([
  ['kq516ks6538', 'kq516ks6538_00_0002'],
  ['zn128qg5660', 'zn128qg5660_00_0002'],
  ['cb002hm8300', 'cb002hm8300_0002'],
  ['ht948tt2809', 'ht948tt2809_00_0002'],
].map(([id, page]) => [`stanford-${id}`, {
  manifest: `https://purl.stanford.edu/${id}/iiif3/manifest`,
  url: `https://stacks.stanford.edu/image/iiif/${id}%2F${page}/full/!480,480/0/default.jpg`,
}]));

export function reviewedThumbnail(record) {
  const reviewed = REVIEWED_IMAGES[record.id];
  if (!reviewed) return null;
  try {
    const references = JSON.parse(record.attributes?.ogm?.dct_references_s || '{}');
    return references['http://iiif.io/api/presentation#manifest'] === reviewed.manifest ? reviewed.url : null;
  } catch { return null; }
}

// Geographic evidence for local maps whose titles use a neighborhood/camp name.
// Bounds must still pass the normal local-size and distance checks.
export const REVIEWED_PLACES = {
  'p16022coll205:646': 'des-moines', // Camp Dodge, metropolitan Des Moines.
  'p16022coll205:591': 'atlanta', // Camp Gordon and vicinity.
  'UYDWJY7IA7KWS9E': 'milwaukee', // Local township survey.
  'ZHNLFX5RZHYBN9A': 'milwaukee', // Local resurvey plat.
};
