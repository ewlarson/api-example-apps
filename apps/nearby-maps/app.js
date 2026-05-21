(function () {
  const API_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1";
  const FRONTEND_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu";
  const PER_PAGE = 60;
  const MAX_FETCH_PAGES = 5;
  const MAX_RENDERED = 18;

  const els = {
    form: document.querySelector("#searchForm"),
    query: document.querySelector("#query"),
    radius: document.querySelector("#radius"),
    lat: document.querySelector("#lat"),
    lon: document.querySelector("#lon"),
    mapsOnly: document.querySelector("#mapsOnly"),
    locateBtn: document.querySelector("#locateBtn"),
    resultsGrid: document.querySelector("#resultsGrid"),
    emptyState: document.querySelector("#emptyState"),
    summaryText: document.querySelector("#summaryText"),
    locationLabel: document.querySelector("#locationLabel"),
    apiStatus: document.querySelector("#apiStatus"),
    cardTemplate: document.querySelector("#cardTemplate"),
    presets: Array.from(document.querySelectorAll(".preset")),
  };

  let abortController = null;
  let currentLocationLabel = "Minneapolis";

  function init() {
    els.form.addEventListener("submit", handleSubmit);
    els.locateBtn.addEventListener("click", useBrowserLocation);
    els.presets.forEach((button) => button.addEventListener("click", handlePreset));

    renderIcons();
    search();
  }

  function handleSubmit(event) {
    event.preventDefault();
    currentLocationLabel = "Custom location";
    markPresetActive(null);
    search();
  }

  function handlePreset(event) {
    const button = event.currentTarget;
    els.lat.value = button.dataset.lat;
    els.lon.value = button.dataset.lon;
    currentLocationLabel = button.dataset.label || "Preset location";
    markPresetActive(button);
    search();
  }

  function markPresetActive(activeButton) {
    els.presets.forEach((button) => button.classList.toggle("active", button === activeButton));
  }

  function useBrowserLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("Location unavailable", "error");
      return;
    }

    setStatus("Locating", "loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        els.lat.value = latitude.toFixed(5);
        els.lon.value = longitude.toFixed(5);
        currentLocationLabel = "Your location";
        markPresetActive(null);
        search();
      },
      () => {
        setStatus("Location blocked", "error");
        els.summaryText.textContent = "Enter coordinates or choose a city.";
      },
      {
        enableHighAccuracy: true,
        maximumAge: 300000,
        timeout: 10000,
      },
    );
  }

  async function search() {
    const location = readLocation();
    if (!location) {
      setStatus("Check coordinates", "error");
      els.summaryText.textContent = "Latitude must be -90 to 90 and longitude must be -180 to 180.";
      return;
    }

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    setStatus("Querying BTAA", "loading");
    showEmpty("Loading local maps.");
    els.locationLabel.textContent = currentLocationLabel;

    try {
      const payload = await fetchSearchResults(location, abortController.signal);
      const results = normalizeResults(payload, location)
        .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
        .slice(0, MAX_RENDERED);

      renderResults(results);
      renderSummary(payload, results, location);
      setStatus("Live API", null);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error(error);
      setStatus("API error", "error");
      showEmpty("The BTAA API did not return results.");
      els.summaryText.textContent = error.message || "Something went wrong.";
    }
  }

  function readLocation() {
    const lat = Number.parseFloat(els.lat.value);
    const lon = Number.parseFloat(els.lon.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return null;
    }

    return { lat, lon };
  }

  async function fetchSearchResults(location, signal) {
    const firstPayload = await requestSearchPage(location, 1, signal);
    const totalPages = firstPayload.meta?.totalPages || 1;
    const pagesToFetch = Math.min(totalPages, MAX_FETCH_PAGES);

    if (pagesToFetch === 1) {
      firstPayload.meta = firstPayload.meta || {};
      firstPayload.meta.rankedCount = firstPayload.data?.length || 0;
      return firstPayload;
    }

    const payloads = [firstPayload];
    for (let page = 2; page <= pagesToFetch; page += 1) {
      payloads.push(await requestSearchPage(location, page, signal));
    }
    const recordsById = new Map();

    payloads.forEach((payload) => {
      (payload.data || []).forEach((record) => {
        const id = record.id || record.attributes?.ogm?.id;
        if (id && !recordsById.has(id)) {
          recordsById.set(id, record);
        }
      });
    });

    return {
      ...firstPayload,
      data: Array.from(recordsById.values()),
      meta: {
        ...(firstPayload.meta || {}),
        rankedCount: recordsById.size,
      },
    };
  }

  async function requestSearchPage(location, page, signal) {
    const response = await fetch(buildSearchUrl(location, page), {
      headers: { Accept: "application/vnd.api+json, application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    return response.json();
  }

  function buildSearchUrl(location, page) {
    const params = new URLSearchParams();
    params.set("q", els.query.value.trim() || "maps");
    params.set("page", String(page));
    params.set("per_page", String(PER_PAGE));
    params.set("include_filters[geo][type]", "distance");
    params.set("include_filters[geo][field]", "dcat_centroid");
    params.set("include_filters[geo][center][lat]", String(location.lat));
    params.set("include_filters[geo][center][lon]", String(location.lon));
    params.set("include_filters[geo][distance]", `${els.radius.value}km`);

    if (els.mapsOnly.checked) {
      params.append("include_filters[gbl_resourceClass_sm][]", "Maps");
    }

    return `${API_BASE}/search?${params.toString()}`;
  }

  function normalizeResults(payload, location) {
    return (payload.data || []).map((item) => {
      const attributes = item.attributes || {};
      const ogm = attributes.ogm || {};
      const ui = item.meta?.ui || {};
      const centroid = parseCentroid(ogm.dcat_centroid);
      const sourceUrl = getSourceUrl(ui, ogm);
      const thumbnailUrl = ui.thumbnail_url || ui.static_map || `${API_BASE}/thumbnails/placeholder`;

      return {
        id: item.id || ogm.id,
        title: ogm.dct_title_s || "Untitled map",
        description: toText(ogm.dct_description_sm) || "No description available.",
        provider: ogm.schema_provider_s || toText(ogm.dct_publisher_sm) || "Unknown",
        spatial: toText(ogm.dct_spatial_sm) || "Unspecified",
        resourceClass: toText(ogm.gbl_resourceClass_sm) || "Resource",
        year: firstValue(ogm.gbl_indexYear_im) || ogm.dct_issued_s || firstValue(ogm.dct_temporal_sm) || "",
        thumbnailUrl,
        sourceUrl,
        recordUrl: `${FRONTEND_BASE}/resources/${encodeURIComponent(item.id || ogm.id)}`,
        distanceKm: centroid ? haversineKm(location, centroid) : null,
      };
    });
  }

  function renderResults(results) {
    els.resultsGrid.replaceChildren();

    if (!results.length) {
      showEmpty("No local maps found.");
      return;
    }

    els.emptyState.hidden = true;
    const fragment = document.createDocumentFragment();

    results.forEach((result) => {
      const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
      const imageLink = card.querySelector(".image-link");
      const image = card.querySelector(".map-thumb");
      const recordLink = card.querySelector(".record-link");
      const detailLink = card.querySelector(".detail-link");
      const sourceLink = card.querySelector(".source-link");

      image.src = result.thumbnailUrl;
      image.alt = `${result.title} thumbnail`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.src = `${API_BASE}/thumbnails/placeholder`;
      }, { once: true });

      imageLink.href = result.recordUrl;
      recordLink.href = result.recordUrl;
      recordLink.textContent = result.title;
      detailLink.href = result.recordUrl;

      if (result.sourceUrl) {
        sourceLink.href = result.sourceUrl;
      } else {
        sourceLink.href = result.recordUrl;
        sourceLink.querySelector("span").textContent = "Details";
      }

      card.querySelector(".distance-badge").textContent = formatDistance(result.distanceKm);
      card.querySelector(".resource-class").textContent = result.resourceClass;
      card.querySelector(".resource-year").textContent = result.year || "n.d.";
      card.querySelector(".description").textContent = result.description;
      card.querySelector(".provider").textContent = result.provider;
      card.querySelector(".spatial").textContent = result.spatial;

      fragment.append(card);
    });

    els.resultsGrid.append(fragment);
    renderIcons();
  }

  function renderSummary(payload, results, location) {
    const total = payload.meta?.totalCount ?? results.length;
    const rankedCount = payload.meta?.rankedCount || results.length;
    const shown = results.length;
    const radius = Number.parseInt(els.radius.value, 10);
    const coordinates = `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;
    const plural = shown === 1 ? "map" : "maps";

    if (rankedCount >= total) {
      els.summaryText.textContent = `${shown} closest ${plural} shown from ${total.toLocaleString()} matches within ${radius} km of ${coordinates}.`;
      return;
    }

    els.summaryText.textContent = `${shown} closest ${plural} shown from ${rankedCount.toLocaleString()} ranked records; ${total.toLocaleString()} total matches within ${radius} km of ${coordinates}.`;
  }

  function showEmpty(message) {
    els.resultsGrid.replaceChildren();
    els.emptyState.hidden = false;
    els.emptyState.querySelector("p").textContent = message;
  }

  function setStatus(message, mode) {
    els.apiStatus.textContent = message;
    els.apiStatus.classList.toggle("is-loading", mode === "loading");
    els.apiStatus.classList.toggle("is-error", mode === "error");
  }

  function getSourceUrl(ui, ogm) {
    const visitSource = ui.links?.["Visit Source"]?.[0]?.url;
    if (visitSource) {
      return visitSource;
    }

    try {
      const references = JSON.parse(ogm.dct_references_s || "{}");
      const schemaUrl = references["http://schema.org/url"];
      if (typeof schemaUrl === "string") {
        return schemaUrl;
      }
    } catch (_) {
      return "";
    }

    return "";
  }

  function parseCentroid(value) {
    if (!value || typeof value !== "string") {
      return null;
    }

    const [lat, lon] = value.split(",").map((part) => Number.parseFloat(part.trim()));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return { lat, lon };
  }

  function haversineKm(a, b) {
    const radiusKm = 6371;
    const dLat = toRadians(b.lat - a.lat);
    const dLon = toRadians(b.lon - a.lon);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * radiusKm * Math.asin(Math.sqrt(h));
  }

  function toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  function formatDistance(distanceKm) {
    if (!Number.isFinite(distanceKm)) {
      return "Nearby";
    }

    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)} m`;
    }

    return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }

    return value || "";
  }

  function firstValue(value) {
    if (Array.isArray(value)) {
      return value[0] ?? "";
    }

    return value ?? "";
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
