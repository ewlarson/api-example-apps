import { normalizeCandidates, deduplicate, shuffle } from './core.mjs';
export const API_BASE = 'https://geo.btaa.org/api/v1';
export function searchUrl(city, fallback = false, page = 1) {
  const params = new URLSearchParams({ per_page: '100', page: String(page), sort: 'relevance' });
  params.set('include_filters[gbl_resourceClass_sm][]', 'Maps');
  if (fallback) params.set('q', `"${city.term}" "${city.stateName}" map`);
  else params.set('adv_q', JSON.stringify([{ op: 'AND', f: 'dct_title_s', q: `"${city.term}"` }]));
  return `${API_BASE}/search?${params}`;
}

export async function fetchResponse(url, signal, fetcher = fetch) {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetcher(url, { signal: AbortSignal.any([signal, timeout]), headers: { Accept: 'application/json, image/*' } });
  if (!response.ok) throw new Error(response.status === 429 ? 'The API is busy. Wait a minute, then retry.' : `BTAA returned ${response.status}. Please retry.`);
  return response;
}

export function imageDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) / a.length);
}

// Read the response, not just <img>.onload: the API's SVG fallback also loads successfully.
export async function preloadThumbnail(resource, signal, fetcher = fetch) {
  const response = await fetchResponse(resource.thumbnailUrl, signal, fetcher);
  if (!/^image\/(jpeg|png|webp|avif)(?:;|$)/i.test(response.headers.get('content-type') || '') || /placeholder/i.test(response.url)) return null;
  const blob = await response.blob();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    signal.throwIfAborted();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (Math.min(width, height) < 60 || Math.max(width, height) < 110 || width / height < .28 || width / height > 3.5) {
      URL.revokeObjectURL(imageUrl); return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 12;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff'; context.fillRect(0, 0, 12, 12);
    context.drawImage(image, 0, 0, 12, 12);
    const pixels = [...context.getImageData(0, 0, 12, 12).data].filter((_, i) => i % 4 !== 3);
    return { ...resource, imageUrl, hash, pixels, width, height, dispose: () => URL.revokeObjectURL(imageUrl) };
  } catch (error) { URL.revokeObjectURL(imageUrl); throw error; }
}

export async function collectUsable(candidates, signal, preload = preloadThumbnail, existing = []) {
  const usable = [...existing];
  try {
    // Four in flight; inspect up to 48 records per query, keeping a useful replay pool.
    for (let start = 0; start < candidates.length && usable.length < 20; start += 4) {
      signal.throwIfAborted();
      const batch = await Promise.all(candidates.slice(start, start + 4).map(async candidate => {
        try { return await preload(candidate, signal); }
        catch { return null; } // The batch checks cancellation and releases decoded images below.
      }));
      for (const map of batch) {
        if (!map) continue;
        if (usable.some(other => other.id === map.id || other.hash && other.hash === map.hash || imageDistance(other.pixels, map.pixels) < 12)) map.dispose?.();
        else usable.push(map);
      }
      signal.throwIfAborted();
    }
    return usable;
  } catch (error) {
    usable.filter(map => !existing.includes(map)).forEach(map => map.dispose?.());
    throw error;
  }
}

export async function loadCity(city, signal, { fetcher = fetch, preload = preloadThumbnail, random = Math.random } = {}) {
  let pool = [], seen = new Set();
  try {
    for (const fallback of [false, true]) {
      const response = await fetchResponse(searchUrl(city, fallback), signal, fetcher);
      const payload = await response.json();
      const candidates = deduplicate([...pool, ...normalizeCandidates(payload, city)]).filter(map => !seen.has(map.id));
      candidates.forEach(map => seen.add(map.id));
      // Keep top-ranked distinctive maps, plus a rotating sample for fresh games.
      const sample = [...candidates.slice(0, 12), ...shuffle(candidates.slice(12), random)].slice(0, 48);
      pool = await collectUsable(sample, signal, (map, activeSignal) => preload(map, activeSignal, fetcher), pool);
      if (pool.length >= 8) break;
    }
    return { pool, dispose: () => pool.forEach(map => map.dispose?.()) };
  } catch (error) { pool.forEach(map => map.dispose?.()); throw error; }
}
