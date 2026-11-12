import { normalizeCandidates, deduplicate, shuffle } from './core.mjs';
import { isBlankOrMask } from './quality.mjs';
export const API_BASE = 'https://geo.btaa.org/api/v1';
export function searchUrl(city, fallback = false, page = 1) {
  const params = new URLSearchParams({ per_page: '100', page: String(page), sort: 'relevance' });
  params.set('include_filters[gbl_resourceClass_sm][]', 'Maps');
  if (fallback === 'nearby') {
    params.set('include_filters[geo][type]', 'distance');
    params.set('include_filters[geo][field]', 'dcat_centroid');
    params.set('include_filters[geo][center][lat]', String(city.lat));
    params.set('include_filters[geo][center][lon]', String(city.lon));
    params.set('include_filters[geo][distance]', '25km');
  } else if (fallback) params.set('q', `"${city.term}" "${city.stateName}" map`);
  else params.set('adv_q', JSON.stringify([{ op: 'AND', f: 'dct_title_s', q: `"${city.term}"` }]));
  return `${API_BASE}/search?${params}`;
}

export class ApiError extends Error {
  constructor(status) {
    super(status === 429 ? 'The API request limit was reached. Wait a minute, then retry.' : `BTAA returned ${status}. Please retry.`);
    this.name = 'ApiError'; this.status = status;
  }
}

export async function fetchResponse(url, signal, fetcher = fetch) {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetcher(url, { signal: AbortSignal.any([signal, timeout]), headers: { Accept: 'application/json, image/*' } });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

export function imageDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) / a.length);
}

// Similar paper colors are not evidence of the same map. Require matching
// spatial luminance structure as well as low pixel distance.
export function imagesSimilar(a, b) {
  const distance = imageDistance(a, b);
  if (distance < 2) return true;
  if (distance >= 12 || !a || !b) return false;
  const grey = pixels => Array.from({ length: pixels.length / 3 }, (_, i) =>
    (pixels[i * 3] + pixels[i * 3 + 1] + pixels[i * 3 + 2]) / 3);
  const x = grey(a), y = grey(b);
  const mx = x.reduce((sum, n) => sum + n, 0) / x.length;
  const my = y.reduce((sum, n) => sum + n, 0) / y.length;
  let covariance = 0, vx = 0, vy = 0;
  x.forEach((n, i) => { covariance += (n - mx) * (y[i] - my); vx += (n - mx) ** 2; vy += (y[i] - my) ** 2; });
  return vx > 0 && vy > 0 && covariance / Math.sqrt(vx * vy) > .97;
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
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff'; context.fillRect(0, 0, 64, 64);
    context.drawImage(image, 0, 0, 64, 64);
    const qualityPixels = [...context.getImageData(0, 0, 64, 64).data].filter((_, i) => i % 4 !== 3);
    if (isBlankOrMask(qualityPixels)) { URL.revokeObjectURL(imageUrl); return null; }
    canvas.width = canvas.height = 12;
    context.fillStyle = '#fff'; context.fillRect(0, 0, 12, 12);
    context.drawImage(image, 0, 0, 12, 12);
    const pixels = [...context.getImageData(0, 0, 12, 12).data].filter((_, i) => i % 4 !== 3);
    return { ...resource, imageUrl, hash, pixels, width, height, dispose: () => URL.revokeObjectURL(imageUrl) };
  } catch (error) { URL.revokeObjectURL(imageUrl); throw error; }
}

export async function collectUsable(candidates, signal, preload = preloadThumbnail, existing = [], diagnostics = { checked: 0, rejected: 0, failed: 0, timedOut: 0 }) {
  const usable = [...existing];
  try {
    // Four in flight; inspect up to 48 records per query, keeping a useful replay pool.
    for (let start = 0; start < candidates.length && usable.length < 20; start += 4) {
      signal.throwIfAborted();
      const batch = await Promise.all(candidates.slice(start, start + 4).map(async candidate => {
        try {
          diagnostics.checked++;
          const map = await preload(candidate, signal);
          if (!map) diagnostics.rejected++;
          return { map };
        } catch (error) {
          diagnostics.failed++;
          if (error.name === 'TimeoutError') diagnostics.timedOut++;
          return { error };
        } // The batch checks cancellation and releases decoded images below.
      }));
      for (const { map } of batch) {
        if (!map) continue;
        if (usable.some(other => other.id === map.id || other.hash && other.hash === map.hash || imagesSimilar(other.pixels, map.pixels))) map.dispose?.();
        else usable.push(map);
      }
      signal.throwIfAborted();
      const fatal = batch.find(item => item.error?.status === 429);
      if (fatal) throw fatal.error;
    }
    return usable;
  } catch (error) {
    usable.filter(map => !existing.includes(map)).forEach(map => map.dispose?.());
    throw error;
  }
}

export async function loadCity(city, signal, { fetcher = fetch, preload = preloadThumbnail, random = Math.random } = {}) {
  let pool = [], seen = new Set();
  const diagnostics = { candidates: 0, checked: 0, rejected: 0, failed: 0, timedOut: 0 };
  const result = (warning = '') => ({ pool, diagnostics, warning, dispose: () => pool.forEach(map => map.dispose?.()) });
  try {
    for (const fallback of [false, true, 'nearby']) {
      const response = await fetchResponse(searchUrl(city, fallback), signal, fetcher);
      const payload = await response.json();
      const candidates = deduplicate([...pool, ...normalizeCandidates(payload, city)]).filter(map => !seen.has(`${map.id}:${map.thumbnailUrl}`));
      candidates.forEach(map => seen.add(`${map.id}:${map.thumbnailUrl}`));
      diagnostics.candidates += candidates.length;
      // Keep top-ranked distinctive maps, plus a rotating sample for fresh games.
      const sample = [...candidates.slice(0, 12), ...shuffle(candidates.slice(12), random)].slice(0, 48);
      pool = await collectUsable(sample, signal, (map, activeSignal) => preload(map, activeSignal, fetcher), pool, diagnostics);
      if (pool.length >= 8) break;
    }
    return result();
  } catch (error) {
    if (!signal.aborted && pool.length >= 4) return result(`Some requests failed. This board uses the ${pool.length} maps already checked. ${error.message}`);
    pool.forEach(map => map.dispose?.()); throw error;
  }
}
