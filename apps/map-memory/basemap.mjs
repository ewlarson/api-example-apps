const MAPLIBRE_URL = 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.js';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
let library;
const snapshots = new Map();
function loadMapLibre() {
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MAPLIBRE_URL;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = () => reject(new Error('Basemap library unavailable'));
    document.head.append(script);
  }).catch(error => { library = null; throw error; });
  return library;
}

// One short-lived WebGL map per city, shared by all card backs. No sixteen-map GPU cost.
export async function renderCityBasemap(city, signal) {
  if (snapshots.has(city.id)) return snapshots.get(city.id);
  const maplibre = await loadMapLibre();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const container = document.createElement('div');
    container.className = 'basemap-renderer'; container.setAttribute('aria-hidden', 'true');
    document.body.append(container);
    let map, timer, settled = false;
    const finish = (url, error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      map?.remove(); container.remove();
      if (url) snapshots.set(city.id, url);
      if (error) reject(error); else resolve(url);
    };
    const abort = () => finish(null, new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(null), 15000);
    try {
      map = new maplibre.Map({
        container, style: STYLE_URL, center: [city.lon, city.lat], zoom: 10,
        interactive: false, attributionControl: false, fadeDuration: 0,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map.once('idle', () => {
        try { finish(map.getCanvas().toDataURL('image/png')); }
        catch { finish(null); }
      });
      map.on('error', () => finish(null));
    } catch { finish(null); }
  });
}
