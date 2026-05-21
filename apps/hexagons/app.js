(function () {
  const API_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1";
  const DEFAULT_BOUNDS = [[24.5, -125], [49.5, -66.5]];
  const MAX_VISIBLE_HEXES = 1800;
  const TOKEN_WAIT_MESSAGE = "We're out of API tokens. Please wait a minute before continuing.";

  const els = {
    form: document.querySelector("#hexForm"),
    query: document.querySelector("#query"),
    resourceClass: document.querySelector("#resourceClass"),
    resolution: document.querySelector("#resolution"),
    autoRefresh: document.querySelector("#autoRefresh"),
    apiStatus: document.querySelector("#apiStatus"),
    mapMessage: document.querySelector("#mapMessage"),
    hexCount: document.querySelector("#hexCount"),
    recordCount: document.querySelector("#recordCount"),
    globalCount: document.querySelector("#globalCount"),
    resolutionValue: document.querySelector("#resolutionValue"),
    selectedTitle: document.querySelector("#selectedTitle"),
    selectedCount: document.querySelector("#selectedCount"),
    selectedShare: document.querySelector("#selectedShare"),
    selectedCenter: document.querySelector("#selectedCenter"),
  };

  let map = null;
  let hexLayer = null;
  let abortController = null;
  let debounceTimer = null;
  let lastPayload = null;

  function init() {
    if (!window.L) {
      setStatus("Map unavailable", "error");
      showMapMessage("Leaflet did not load.");
      return;
    }

    if (!getH3()) {
      setStatus("H3 unavailable", "error");
      showMapMessage("The H3 browser library did not load.");
      return;
    }

    map = L.map("map", {
      maxBounds: [[15, -170], [73, -50]],
      maxBoundsViscosity: 0.75,
      worldCopyJump: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    map.fitBounds(DEFAULT_BOUNDS);
    hexLayer = L.layerGroup().addTo(map);

    els.form.addEventListener("submit", handleSubmit);
    els.query.addEventListener("input", markMapStale);
    els.resourceClass.addEventListener("change", requestHexagons);
    els.resolution.addEventListener("change", requestHexagons);
    els.autoRefresh.addEventListener("change", handleAutoRefreshChange);
    map.on("moveend zoomend", handleMapChanged);

    renderIcons();
    requestHexagons();
  }

  function handleSubmit(event) {
    event.preventDefault();
    requestHexagons();
  }

  function handleMapChanged() {
    if (els.autoRefresh.checked) {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(requestHexagons, 450);
      return;
    }

    markMapStale();
  }

  function handleAutoRefreshChange() {
    if (els.autoRefresh.checked) {
      requestHexagons();
      return;
    }

    markMapStale();
  }

  function markMapStale() {
    if (lastPayload) {
      setStatus("Refresh ready", "stale");
    }
  }

  async function requestHexagons() {
    if (!map) {
      return;
    }

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    clearMapMessage();
    setStatus("Loading hexes", "loading");
    els.resolutionValue.textContent = els.resolution.value;

    try {
      const payload = await fetchHexagons(abortController.signal);
      lastPayload = payload;
      renderHexagons(payload);
      setStatus("Live API", null);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error(error);

      if (isApiTokenExhaustion(error)) {
        setStatus("API tokens exhausted", "error");
        showMapMessage(TOKEN_WAIT_MESSAGE);
        return;
      }

      setStatus("API error", "error");
      showMapMessage(error.message || "The BTAA API did not return hexagons.");
    }
  }

  async function fetchHexagons(signal) {
    const response = await fetch(buildHexUrl(), {
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response.json();
  }

  function buildHexUrl() {
    const params = new URLSearchParams();
    const bounds = map.getBounds();
    const bbox = [
      bounds.getWest().toFixed(5),
      bounds.getSouth().toFixed(5),
      bounds.getEast().toFixed(5),
      bounds.getNorth().toFixed(5),
    ].join(",");

    params.set("bbox", bbox);
    params.set("resolution", els.resolution.value);

    const query = els.query.value.trim();
    if (query) {
      params.set("q", query);
    }

    if (els.resourceClass.value) {
      params.append("include_filters[gbl_resourceClass_sm][]", els.resourceClass.value);
    }

    return `${API_BASE}/map/h3?${params.toString()}`;
  }

  async function createApiError(response) {
    const details = await readErrorDetails(response);
    const message = details ? `API returned ${response.status}: ${details}` : `API returned ${response.status}`;
    const error = new Error(message);
    error.name = "ApiError";
    error.status = response.status;
    error.details = details;
    return error;
  }

  async function readErrorDetails(response) {
    try {
      const text = await response.text();
      return text.trim().slice(0, 240);
    } catch (_) {
      return "";
    }
  }

  function isApiTokenExhaustion(error) {
    if (error.status === 429 || error.status === 500) {
      return true;
    }

    return /token|rate.?limit|quota|too many requests/i.test(error.details || error.message || "");
  }

  function renderHexagons(payload) {
    const h3 = getH3();
    const allHexes = Array.isArray(payload.hexes) ? payload.hexes : [];
    const hexes = allHexes.slice(0, MAX_VISIBLE_HEXES);
    const totalInView = allHexes.reduce((sum, entry) => sum + readCount(entry), 0);
    const maxCount = Math.max(...hexes.map(readCount), 1);
    const resolution = payload.resolution ?? Number.parseInt(els.resolution.value, 10);

    hexLayer.clearLayers();
    clearSelection();

    hexes.forEach((entry) => {
      const cell = readCell(entry);
      const count = readCount(entry);
      const boundary = getBoundary(h3, cell);
      const center = getCenter(h3, cell);

      if (!cell || boundary.length < 3) {
        return;
      }

      const polygon = L.polygon(boundary, {
        className: "h3-hex",
        color: "#0f5b78",
        fillColor: getFillColor(count, maxCount),
        fillOpacity: getFillOpacity(count, maxCount),
        opacity: 0.78,
        weight: getStrokeWeight(count, maxCount),
      });

      const hex = { cell, count, center, resolution, totalInView };
      polygon.bindPopup(renderPopup(hex));
      polygon.on("click", () => renderSelection(hex));
      polygon.addTo(hexLayer);
    });

    els.hexCount.textContent = formatNumber(allHexes.length);
    els.recordCount.textContent = formatNumber(totalInView);
    els.globalCount.textContent = formatNumber(payload.globalCount ?? 0);
    els.resolutionValue.textContent = String(resolution);

    if (allHexes.length > MAX_VISIBLE_HEXES) {
      showMapMessage(`${formatNumber(MAX_VISIBLE_HEXES)} hexagons shown. Zoom in or filter to inspect a smaller area.`);
    }
  }

  function readCell(entry) {
    if (Array.isArray(entry)) {
      return entry[0];
    }

    return entry?.cell || entry?.h3 || entry?.hex || entry?.id || "";
  }

  function readCount(entry) {
    if (Array.isArray(entry)) {
      return Number(entry[1]) || 0;
    }

    return Number(entry?.count || entry?.value || entry?.records || 0);
  }

  function getBoundary(h3, cell) {
    try {
      if (typeof h3.cellToBoundary === "function") {
        return h3.cellToBoundary(cell, false);
      }

      if (typeof h3.h3ToGeoBoundary === "function") {
        return h3.h3ToGeoBoundary(cell, false);
      }
    } catch (_) {
      return [];
    }

    return [];
  }

  function getCenter(h3, cell) {
    try {
      if (typeof h3.cellToLatLng === "function") {
        const [lat, lon] = h3.cellToLatLng(cell);
        return { lat, lon };
      }

      if (typeof h3.h3ToGeo === "function") {
        const [lat, lon] = h3.h3ToGeo(cell);
        return { lat, lon };
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  function renderPopup(hex) {
    return `
      <div class="hex-popup">
        <h3>${escapeHtml(hex.cell)}</h3>
        <dl>
          <div>
            <dt>Records</dt>
            <dd>${formatNumber(hex.count)}</dd>
          </div>
          <div>
            <dt>Share</dt>
            <dd>${formatPercent(hex.count, hex.totalInView)}</dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>${hex.resolution}</dd>
          </div>
          <div>
            <dt>Center</dt>
            <dd>${formatCenter(hex.center)}</dd>
          </div>
        </dl>
      </div>
    `;
  }

  function renderSelection(hex) {
    els.selectedTitle.textContent = hex.cell;
    els.selectedCount.textContent = formatNumber(hex.count);
    els.selectedShare.textContent = formatPercent(hex.count, hex.totalInView);
    els.selectedCenter.textContent = formatCenter(hex.center);
  }

  function clearSelection() {
    els.selectedTitle.textContent = "None selected";
    els.selectedCount.textContent = "-";
    els.selectedShare.textContent = "-";
    els.selectedCenter.textContent = "-";
  }

  function getFillColor(count, maxCount) {
    const ratio = Math.max(0, Math.min(1, count / maxCount));

    if (ratio > 0.72) {
      return "#1e3a5f";
    }

    if (ratio > 0.42) {
      return "#0f6f8f";
    }

    if (ratio > 0.18) {
      return "#168a78";
    }

    return "#72b37e";
  }

  function getFillOpacity(count, maxCount) {
    const ratio = Math.max(0, Math.min(1, count / maxCount));
    return 0.24 + ratio * 0.5;
  }

  function getStrokeWeight(count, maxCount) {
    const ratio = Math.max(0, Math.min(1, count / maxCount));
    return ratio > 0.45 ? 1.7 : 1;
  }

  function setStatus(message, mode) {
    els.apiStatus.textContent = message;
    els.apiStatus.classList.toggle("is-loading", mode === "loading");
    els.apiStatus.classList.toggle("is-error", mode === "error");
    els.apiStatus.classList.toggle("is-stale", mode === "stale");
  }

  function showMapMessage(message) {
    els.mapMessage.textContent = message;
    els.mapMessage.hidden = false;
  }

  function clearMapMessage() {
    els.mapMessage.textContent = "";
    els.mapMessage.hidden = true;
  }

  function getH3() {
    return window.h3 || window.h3js || window.h3Js || null;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function formatPercent(value, total) {
    if (!total) {
      return "0%";
    }

    return `${((value / total) * 100).toFixed(value / total < 0.01 ? 2 : 1)}%`;
  }

  function formatCenter(center) {
    if (!center) {
      return "-";
    }

    return `${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  window.addEventListener("DOMContentLoaded", init);
}());
