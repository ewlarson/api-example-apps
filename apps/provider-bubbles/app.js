(function () {
  const API_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1";
  const FRONTEND_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu";
  const DEFAULT_BOUNDS = [[24.5, -125], [49.5, -66.5]];
  const TOKEN_WAIT_MESSAGE = "We're out of API tokens. Please wait a minute before continuing.";
  const MIN_RADIUS = 7;
  const MAX_RADIUS = 48;

  const PROVIDER_LOCATIONS = {
    "Indiana University": {
      displayName: "Indiana University",
      campus: "Bloomington, IN",
      lat: 39.1653,
      lon: -86.5264,
    },
    "Stanford": {
      displayName: "Stanford University",
      campus: "Stanford, CA",
      lat: 37.4275,
      lon: -122.1697,
    },
    "University of Chicago": {
      displayName: "University of Chicago",
      campus: "Chicago, IL",
      lat: 41.7897,
      lon: -87.5997,
    },
    "UW-Madison Robinson Map Library": {
      displayName: "UW-Madison Robinson Map Library",
      campus: "Madison, WI",
      lat: 43.0753,
      lon: -89.4034,
    },
    "University of Minnesota": {
      displayName: "University of Minnesota",
      campus: "Minneapolis, MN",
      lat: 44.974,
      lon: -93.2277,
    },
    "Rutgers University-New Brunswick": {
      displayName: "Rutgers University-New Brunswick",
      campus: "New Brunswick, NJ",
      lat: 40.5008,
      lon: -74.4474,
    },
    "Pennsylvania State University": {
      displayName: "Pennsylvania State University",
      campus: "University Park, PA",
      lat: 40.7982,
      lon: -77.8599,
    },
    "University of Wisconsin-Madison": {
      displayName: "University of Wisconsin-Madison",
      campus: "Madison, WI",
      lat: 43.0731,
      lon: -89.4012,
    },
    "University of Iowa": {
      displayName: "University of Iowa",
      campus: "Iowa City, IA",
      lat: 41.6627,
      lon: -91.5549,
    },
    "University of Illinois Urbana-Champaign": {
      displayName: "University of Illinois Urbana-Champaign",
      campus: "Urbana-Champaign, IL",
      lat: 40.102,
      lon: -88.2272,
    },
    "Michigan State University": {
      displayName: "Michigan State University",
      campus: "East Lansing, MI",
      lat: 42.7018,
      lon: -84.4822,
    },
    "University of Michigan": {
      displayName: "University of Michigan",
      campus: "Ann Arbor, MI",
      lat: 42.278,
      lon: -83.7382,
    },
    "Minnesota Geospatial Commons": {
      displayName: "Minnesota Geospatial Commons",
      campus: "St. Paul, MN",
      lat: 44.9544,
      lon: -93.0913,
    },
    "Princeton": {
      displayName: "Princeton University",
      campus: "Princeton, NJ",
      lat: 40.3431,
      lon: -74.6551,
    },
    "American Geographical Society Library \u2013 UWM Libraries": {
      displayName: "American Geographical Society Library",
      campus: "Milwaukee, WI",
      lat: 43.075,
      lon: -87.881,
    },
    "Cornell": {
      displayName: "Cornell University",
      campus: "Ithaca, NY",
      lat: 42.4534,
      lon: -76.4735,
    },
    "University of Nebraska-Lincoln": {
      displayName: "University of Nebraska-Lincoln",
      campus: "Lincoln, NE",
      lat: 40.8176,
      lon: -96.7005,
    },
    "University of Maryland": {
      displayName: "University of Maryland",
      campus: "College Park, MD",
      lat: 38.9869,
      lon: -76.9426,
    },
    "The Ohio State University": {
      displayName: "The Ohio State University",
      campus: "Columbus, OH",
      lat: 40.0067,
      lon: -83.0305,
    },
    "Northwestern University": {
      displayName: "Northwestern University",
      campus: "Evanston, IL",
      lat: 42.0565,
      lon: -87.6753,
    },
    "Purdue University": {
      displayName: "Purdue University",
      campus: "West Lafayette, IN",
      lat: 40.4237,
      lon: -86.9212,
    },
    "Harvard": {
      displayName: "Harvard University",
      campus: "Cambridge, MA",
      lat: 42.377,
      lon: -71.1167,
    },
    "Oregon GEOHub": {
      displayName: "Oregon GEOHub",
      campus: "Salem, OR",
      lat: 44.9429,
      lon: -123.0351,
    },
  };

  const els = {
    apiStatus: document.querySelector("#apiStatus"),
    totalCount: document.querySelector("#totalCount"),
    mappedCount: document.querySelector("#mappedCount"),
    largestCount: document.querySelector("#largestCount"),
    unmappedCount: document.querySelector("#unmappedCount"),
    selectedName: document.querySelector("#selectedName"),
    selectedRecords: document.querySelector("#selectedRecords"),
    selectedShare: document.querySelector("#selectedShare"),
    selectedCampus: document.querySelector("#selectedCampus"),
    selectedLink: document.querySelector("#selectedLink"),
    resetSelection: document.querySelector("#resetSelection"),
    facetList: document.querySelector("#facetList"),
    providerList: document.querySelector("#providerList"),
    mapMessage: document.querySelector("#mapMessage"),
  };

  let map = null;
  let bubbleLayer = null;
  let selectedLayer = null;
  let providers = [];
  let totalRecords = 0;

  function init() {
    if (!window.L) {
      setStatus("Map unavailable", "error");
      showMapMessage("Leaflet did not load.");
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
    bubbleLayer = L.layerGroup().addTo(map);
    els.resetSelection.addEventListener("click", () => selectAllProviders());

    renderIcons();
    loadDashboard();
  }

  async function loadDashboard() {
    setStatus("Loading counts", "loading");
    clearMapMessage();

    try {
      const [providerPayload, summaryPayload] = await Promise.all([
        fetchProviderFacet(),
        fetchSearchSummary(),
      ]);

      providers = normalizeProviders(providerPayload);
      totalRecords = Number(summaryPayload.meta?.totalCount || 0);

      renderBubbles(providers);
      renderStats(providers);
      renderProviderList(providers);
      renderSelection(null, getSearchFacetValues(summaryPayload, "gbl_resourceClass_sm"));
      setStatus("Live API", null);
    } catch (error) {
      console.error(error);

      if (isApiTokenExhaustion(error)) {
        setStatus("API tokens exhausted", "error");
        showMapMessage(TOKEN_WAIT_MESSAGE);
        return;
      }

      setStatus("API error", "error");
      showMapMessage(error.message || "The BTAA API did not return provider counts.");
    }
  }

  async function fetchProviderFacet() {
    const params = new URLSearchParams({
      page: "1",
      per_page: "100",
      sort: "count_desc",
    });

    return fetchJson(`${API_BASE}/search/facets/schema_provider_s?${params.toString()}`);
  }

  async function fetchSearchSummary() {
    const params = new URLSearchParams({
      page: "1",
      per_page: "1",
      fields: "id",
      facets: "gbl_resourceClass_sm",
    });

    return fetchJson(`${API_BASE}/search?${params.toString()}`);
  }

  async function fetchClassFacet(providerValue) {
    const params = new URLSearchParams({
      page: "1",
      per_page: "20",
      sort: "count_desc",
    });

    if (providerValue !== undefined && providerValue !== null) {
      params.append("include_filters[schema_provider_s][]", providerValue);
    }

    return fetchJson(`${API_BASE}/search/facets/gbl_resourceClass_sm?${params.toString()}`);
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.api+json, application/json" },
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response.json();
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

  function normalizeProviders(payload) {
    return (payload.data || []).map((entry, index) => {
      const value = entry.attributes?.value ?? entry.id ?? "";
      const count = Number(entry.attributes?.hits || 0);
      const location = PROVIDER_LOCATIONS[value] || null;
      const name = location?.displayName || value || "Unassigned provider";

      return {
        value,
        count,
        location,
        name,
        rank: index + 1,
      };
    });
  }

  function getFacetValues(payload) {
    return (payload.data || [])
      .map((entry) => ({
        value: entry.attributes?.value ?? entry.id ?? "Unknown",
        count: Number(entry.attributes?.hits || 0),
      }))
      .filter((facet) => facet.count > 0);
  }

  function getSearchFacetValues(payload, facetName) {
    const facet = (payload.included || []).find((entry) => entry.type === "facet" && entry.id === facetName);
    return (facet?.attributes?.items || [])
      .map(([value, count]) => ({
        value,
        count: Number(count || 0),
      }))
      .filter((entry) => entry.count > 0);
  }

  function renderBubbles(providerList) {
    const mappedProviders = providerList.filter((provider) => provider.location);
    const maxCount = Math.max(...mappedProviders.map((provider) => provider.count), 1);

    bubbleLayer.clearLayers();
    selectedLayer = null;

    mappedProviders.forEach((provider) => {
      const marker = L.circleMarker([provider.location.lat, provider.location.lon], {
        radius: getBubbleRadius(provider.count, maxCount),
        color: "#003c5b",
        fillColor: getBubbleColor(provider.rank),
        fillOpacity: 0.62,
        opacity: 0.9,
        weight: 2,
      });

      marker.bindTooltip(provider.name, {
        className: "provider-tooltip",
        direction: "top",
        offset: [0, -4],
      });
      marker.bindPopup(renderPopup(provider));
      marker.on("click", () => selectProvider(provider, marker));
      marker.addTo(bubbleLayer);
    });
  }

  function getBubbleRadius(count, maxCount) {
    const ratio = Math.sqrt(count / maxCount);
    return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
  }

  function getBubbleColor(rank) {
    if (rank <= 3) {
      return "#0f6f8f";
    }

    if (rank <= 8) {
      return "#13795b";
    }

    if (rank <= 15) {
      return "#8a5a00";
    }

    return "#6b7280";
  }

  function renderStats(providerList) {
    const mapped = providerList.filter((provider) => provider.location);
    const largest = providerList[0]?.count || 0;
    const mappedRecords = mapped.reduce((sum, provider) => sum + provider.count, 0);
    const unmappedRecords = Math.max(totalRecords - mappedRecords, 0);

    els.totalCount.textContent = formatNumber(totalRecords);
    els.mappedCount.textContent = formatNumber(mapped.length);
    els.largestCount.textContent = formatNumber(largest);
    els.unmappedCount.textContent = formatNumber(unmappedRecords);
  }

  function renderProviderList(providerList) {
    const maxCount = Math.max(...providerList.map((provider) => provider.count), 1);
    const fragment = document.createDocumentFragment();

    providerList.forEach((provider) => {
      const button = document.createElement("button");
      button.className = "provider-row";
      button.type = "button";
      button.dataset.value = provider.value;
      button.disabled = provider.count === 0;
      button.addEventListener("click", () => {
        const layer = findLayerForProvider(provider);
        selectProvider(provider, layer);
      });

      const rank = document.createElement("span");
      rank.className = "provider-rank";
      rank.textContent = String(provider.rank);

      const body = document.createElement("span");
      body.className = "provider-row-body";

      const nameLine = document.createElement("span");
      nameLine.className = "provider-row-name";
      nameLine.textContent = provider.name;

      const campusLine = document.createElement("span");
      campusLine.className = "provider-row-campus";
      campusLine.textContent = provider.location?.campus || "No mapped campus";

      const bar = document.createElement("span");
      bar.className = "provider-row-bar";
      const fill = document.createElement("span");
      fill.style.width = `${Math.max((provider.count / maxCount) * 100, 1)}%`;
      bar.append(fill);

      const count = document.createElement("span");
      count.className = "provider-row-count";
      count.textContent = formatNumber(provider.count);

      body.append(nameLine, campusLine, bar);
      button.append(rank, body, count);
      fragment.append(button);
    });

    els.providerList.replaceChildren(fragment);
  }

  function findLayerForProvider(provider) {
    let foundLayer = null;

    bubbleLayer.eachLayer((layer) => {
      const latLng = layer.getLatLng();
      if (
        provider.location &&
        latLng.lat === provider.location.lat &&
        latLng.lng === provider.location.lon
      ) {
        foundLayer = layer;
      }
    });

    return foundLayer;
  }

  async function selectProvider(provider, layer) {
    setActiveProvider(provider.value);
    setStatus("Loading facets", "loading");

    if (layer) {
      highlightLayer(layer);
      map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 6), {
        duration: 0.55,
      });
      layer.openPopup();
    } else if (provider.location) {
      resetHighlightedLayer();
      map.flyTo([provider.location.lat, provider.location.lon], Math.max(map.getZoom(), 6), {
        duration: 0.55,
      });
    } else {
      resetHighlightedLayer();
    }

    try {
      const classPayload = await fetchClassFacet(provider.value);
      renderSelection(provider, getFacetValues(classPayload));
      setStatus("Live API", null);
    } catch (error) {
      console.error(error);
      setStatus("API error", "error");
      showMapMessage(error.message || "The BTAA API did not return provider facets.");
    }
  }

  async function selectAllProviders() {
    setActiveProvider(null);
    resetHighlightedLayer();
    map.fitBounds(DEFAULT_BOUNDS);
    setStatus("Loading facets", "loading");

    try {
      const classPayload = await fetchClassFacet();
      renderSelection(null, getFacetValues(classPayload));
      setStatus("Live API", null);
    } catch (error) {
      console.error(error);
      setStatus("API error", "error");
      showMapMessage(error.message || "The BTAA API did not return resource class facets.");
    }
  }

  function highlightLayer(layer) {
    resetHighlightedLayer();
    selectedLayer = layer;
    layer.setStyle({
      color: "#7c2d12",
      fillColor: "#dc6a2a",
      fillOpacity: 0.74,
      weight: 3,
    });
    layer.bringToFront();
  }

  function resetHighlightedLayer() {
    if (!selectedLayer) {
      return;
    }

    const provider = findProviderByLayer(selectedLayer);
    if (provider) {
      selectedLayer.setStyle({
        color: "#003c5b",
        fillColor: getBubbleColor(provider.rank),
        fillOpacity: 0.62,
        opacity: 0.9,
        weight: 2,
      });
    }

    selectedLayer = null;
  }

  function findProviderByLayer(layer) {
    const latLng = layer.getLatLng();
    return providers.find((provider) => (
      provider.location &&
      latLng.lat === provider.location.lat &&
      latLng.lng === provider.location.lon
    ));
  }

  function setActiveProvider(value) {
    Array.from(els.providerList.querySelectorAll(".provider-row")).forEach((button) => {
      button.classList.toggle("is-active", value !== null && button.dataset.value === value);
    });
  }

  function renderSelection(provider, facets) {
    const count = provider ? provider.count : totalRecords;
    const shareBase = totalRecords || count;

    els.selectedName.textContent = provider ? provider.name : "All providers";
    els.selectedRecords.textContent = formatNumber(count);
    els.selectedShare.textContent = formatPercent(count, shareBase);
    els.selectedCampus.textContent = provider?.location?.campus || "United States";
    els.selectedLink.href = buildSearchLink(provider);
    renderFacetList(facets);
    renderIcons();
  }

  function renderFacetList(facets) {
    const maxCount = Math.max(...facets.map((facet) => facet.count), 1);
    const fragment = document.createDocumentFragment();

    facets.forEach((facet) => {
      const row = document.createElement("div");
      row.className = "bar-row";

      const label = document.createElement("span");
      label.className = "bar-label";
      label.textContent = facet.value || "Unknown";

      const value = document.createElement("span");
      value.className = "bar-count";
      value.textContent = formatNumber(facet.count);

      const track = document.createElement("span");
      track.className = "bar-track";
      const fill = document.createElement("span");
      fill.style.width = `${Math.max((facet.count / maxCount) * 100, 1)}%`;
      track.append(fill);

      row.append(label, value, track);
      fragment.append(row);
    });

    els.facetList.replaceChildren(fragment);
  }

  function renderPopup(provider) {
    return `
      <div class="provider-popup">
        <h3>${escapeHtml(provider.name)}</h3>
        <dl>
          <div>
            <dt>Records</dt>
            <dd>${formatNumber(provider.count)}</dd>
          </div>
          <div>
            <dt>Share</dt>
            <dd>${formatPercent(provider.count, totalRecords)}</dd>
          </div>
          <div>
            <dt>Campus</dt>
            <dd>${escapeHtml(provider.location.campus)}</dd>
          </div>
        </dl>
      </div>
    `;
  }

  function buildSearchLink(provider) {
    if (!provider) {
      return `${FRONTEND_BASE}/search`;
    }

    const params = new URLSearchParams();
    params.append("include_filters[schema_provider_s][]", provider.value);
    return `${FRONTEND_BASE}/search?${params.toString()}`;
  }

  function setStatus(message, mode) {
    els.apiStatus.textContent = message;
    els.apiStatus.classList.toggle("is-loading", mode === "loading");
    els.apiStatus.classList.toggle("is-error", mode === "error");
  }

  function showMapMessage(message) {
    els.mapMessage.textContent = message;
    els.mapMessage.hidden = false;
  }

  function clearMapMessage() {
    els.mapMessage.textContent = "";
    els.mapMessage.hidden = true;
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
