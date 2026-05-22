(function () {
  const API_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1";
  const FRONTEND_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu";
  const PER_PAGE = 12;
  const TOKEN_WAIT_MESSAGE = "We're out of API tokens. Please wait a minute before continuing.";

  const CAMPUS_STOPS = [
    {
      name: "Rutgers University-New Brunswick",
      campus: "New Brunswick, NJ",
      lat: 40.5008,
      lon: -74.4474,
      providerValues: ["Rutgers University-New Brunswick"],
      nameQuery: "Rutgers campus map",
      localQuery: "Rutgers New Brunswick",
    },
    {
      name: "University of Maryland",
      campus: "College Park, MD",
      lat: 38.9869,
      lon: -76.9426,
      providerValues: ["University of Maryland"],
      nameQuery: "University of Maryland campus map",
      localQuery: "Maryland",
    },
    {
      name: "Pennsylvania State University",
      campus: "University Park, PA",
      lat: 40.7982,
      lon: -77.8599,
      providerValues: ["Pennsylvania State University"],
      nameQuery: "Penn State campus map",
      localQuery: "Pennsylvania",
    },
    {
      name: "The Ohio State University",
      campus: "Columbus, OH",
      lat: 40.0067,
      lon: -83.0305,
      providerValues: ["The Ohio State University"],
      nameQuery: "Ohio State campus map",
      localQuery: "Ohio",
    },
    {
      name: "University of Michigan",
      campus: "Ann Arbor, MI",
      lat: 42.278,
      lon: -83.7382,
      providerValues: ["University of Michigan"],
      nameQuery: "University of Michigan campus map",
      localQuery: "Ann Arbor",
    },
    {
      name: "Michigan State University",
      campus: "East Lansing, MI",
      lat: 42.7018,
      lon: -84.4822,
      providerValues: ["Michigan State University"],
      nameQuery: "Michigan State campus map",
      localQuery: "East Lansing",
    },
    {
      name: "Indiana University",
      campus: "Bloomington, IN",
      lat: 39.1653,
      lon: -86.5264,
      providerValues: ["Indiana University"],
      nameQuery: "Indiana University campus map",
      localQuery: "Indiana",
    },
    {
      name: "Purdue University",
      campus: "West Lafayette, IN",
      lat: 40.4237,
      lon: -86.9212,
      providerValues: ["Purdue University"],
      nameQuery: "Purdue campus map",
      localQuery: "Purdue",
    },
    {
      name: "Northwestern University",
      campus: "Evanston, IL",
      lat: 42.0565,
      lon: -87.6753,
      providerValues: ["Northwestern University"],
      nameQuery: "Northwestern campus map",
      localQuery: "Northwestern",
    },
    {
      name: "University of Illinois Urbana-Champaign",
      campus: "Urbana-Champaign, IL",
      lat: 40.102,
      lon: -88.2272,
      providerValues: ["University of Illinois Urbana-Champaign"],
      nameQuery: "University of Illinois campus map",
      localQuery: "Urbana Champaign",
    },
    {
      name: "University of Wisconsin-Madison",
      campus: "Madison, WI",
      lat: 43.0731,
      lon: -89.4012,
      providerValues: ["University of Wisconsin-Madison", "UW-Madison Robinson Map Library"],
      nameQuery: "University of Wisconsin campus map",
      localQuery: "Wisconsin",
    },
    {
      name: "University of Iowa",
      campus: "Iowa City, IA",
      lat: 41.6627,
      lon: -91.5549,
      providerValues: ["University of Iowa"],
      nameQuery: "University of Iowa campus map",
      localQuery: "Iowa",
    },
    {
      name: "University of Minnesota",
      campus: "Minneapolis, MN",
      lat: 44.974,
      lon: -93.2277,
      providerValues: ["University of Minnesota"],
      nameQuery: "University of Minnesota campus map",
      localQuery: "University of Minnesota",
    },
    {
      name: "University of Nebraska-Lincoln",
      campus: "Lincoln, NE",
      lat: 40.8176,
      lon: -96.7005,
      providerValues: ["University of Nebraska-Lincoln"],
      nameQuery: "Nebraska campus map",
      localQuery: "Nebraska",
    },
    {
      name: "University of Southern California",
      campus: "Los Angeles, CA",
      lat: 34.0224,
      lon: -118.2851,
      providerValues: [],
      nameQuery: "University of Southern California campus map",
      localQuery: "Southern California",
    },
    {
      name: "University of California, Los Angeles",
      campus: "Los Angeles, CA",
      lat: 34.0689,
      lon: -118.4452,
      providerValues: [],
      nameQuery: "UCLA campus map",
      localQuery: "UCLA",
    },
    {
      name: "University of Washington",
      campus: "Seattle, WA",
      lat: 47.6553,
      lon: -122.3035,
      providerValues: [],
      nameQuery: "University of Washington campus map",
      localQuery: "Washington",
    },
    {
      name: "University of Oregon",
      campus: "Eugene, OR",
      lat: 44.0448,
      lon: -123.0726,
      providerValues: [],
      nameQuery: "University of Oregon campus map",
      localQuery: "Oregon",
    },
  ];

  const PACIFIC_FINISH = {
    name: "Pacific Ocean",
    lat: 44.633,
    lon: -124.064,
  };

  const els = {
    campusName: document.querySelector("#campusName"),
    campusPlace: document.querySelector("#campusPlace"),
    campusProvider: document.querySelector("#campusProvider"),
    stopCount: document.querySelector("#stopCount"),
    legMiles: document.querySelector("#legMiles"),
    routeMiles: document.querySelector("#routeMiles"),
    prevStop: document.querySelector("#prevStop"),
    nextStop: document.querySelector("#nextStop"),
    stopList: document.querySelector("#stopList"),
    apiStatus: document.querySelector("#apiStatus"),
    overlayStop: document.querySelector("#overlayStop"),
    overlayMiles: document.querySelector("#overlayMiles"),
    dockTitle: document.querySelector("#dockTitle"),
    zoomOut: document.querySelector("#zoomOut"),
    resetView: document.querySelector("#resetView"),
    zoomIn: document.querySelector("#zoomIn"),
    recordLink: document.querySelector("#recordLink"),
    viewerStage: document.querySelector("#viewerStage"),
    viewerImage: document.querySelector("#viewerImage"),
    viewerEmpty: document.querySelector("#viewerEmpty"),
    resourceTitle: document.querySelector("#resourceTitle"),
    resourceMeta: document.querySelector("#resourceMeta"),
    resourceStrip: document.querySelector("#resourceStrip"),
  };

  let map = null;
  let routeLayer = null;
  let finishLayer = null;
  let markerLayer = null;
  let markers = [];
  let currentIndex = 0;
  let currentResources = [];
  let currentResourceIndex = -1;
  let abortController = null;
  let resourceCache = new Map();
  let stopStats = [];

  const viewer = {
    scale: 1,
    x: 0,
    y: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  function init() {
    stopStats = buildStopStats();
    renderStopList();
    attachEvents();

    if (!window.L) {
      setStatus("Map unavailable", "error");
      showViewerMessage("Leaflet did not load.");
      return;
    }

    initMap();
    renderIcons();
    selectStop(0, { instant: true });
  }

  function attachEvents() {
    els.prevStop.addEventListener("click", () => selectStop(currentIndex - 1));
    els.nextStop.addEventListener("click", () => selectStop(currentIndex + 1));
    els.zoomOut.addEventListener("click", () => zoomViewer(0.82));
    els.zoomIn.addEventListener("click", () => zoomViewer(1.22));
    els.resetView.addEventListener("click", resetViewer);
    els.viewerStage.addEventListener("wheel", handleViewerWheel, { passive: false });
    els.viewerStage.addEventListener("pointerdown", beginViewerDrag);
    window.addEventListener("pointermove", dragViewer);
    window.addEventListener("pointerup", endViewerDrag);
  }

  function initMap() {
    map = L.map("map", {
      maxBounds: [[15, -170], [73, -50]],
      maxBoundsViscosity: 0.75,
      worldCopyJump: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    routeLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    drawRoute();
    renderCampusMarkers();
  }

  function drawRoute() {
    const routeCoordinates = CAMPUS_STOPS.map((stop) => [stop.lat, stop.lon]);
    const finalLeg = [
      [CAMPUS_STOPS[CAMPUS_STOPS.length - 1].lat, CAMPUS_STOPS[CAMPUS_STOPS.length - 1].lon],
      [PACIFIC_FINISH.lat, PACIFIC_FINISH.lon],
    ];

    L.polyline(routeCoordinates, {
      color: "#c2410c",
      opacity: 0.78,
      weight: 4,
    }).addTo(routeLayer);

    L.polyline(finalLeg, {
      color: "#13795b",
      dashArray: "8 8",
      opacity: 0.85,
      weight: 4,
    }).addTo(routeLayer);

    finishLayer = L.marker([PACIFIC_FINISH.lat, PACIFIC_FINISH.lon], {
      icon: L.divIcon({
        className: "",
        html: '<span class="finish-marker">P</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
      keyboard: false,
    }).addTo(routeLayer);

    finishLayer.bindTooltip("Pacific Ocean", {
      className: "campus-tooltip",
      direction: "top",
    });
  }

  function renderCampusMarkers() {
    markerLayer.clearLayers();
    markers = CAMPUS_STOPS.map((stop, index) => {
      const marker = L.marker([stop.lat, stop.lon], {
        icon: buildCampusIcon(index, index === currentIndex),
      });

      marker.bindTooltip(`${index + 1}. ${stop.name}`, {
        className: "campus-tooltip",
        direction: "top",
      });
      marker.bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.campus)}`);
      marker.on("click", () => selectStop(index));
      marker.addTo(markerLayer);
      return marker;
    });
  }

  function buildCampusIcon(index, active) {
    return L.divIcon({
      className: "",
      html: `<span class="campus-marker${active ? " is-active" : ""}">${index + 1}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
      tooltipAnchor: [0, -15],
    });
  }

  function renderStopList() {
    const fragment = document.createDocumentFragment();

    CAMPUS_STOPS.forEach((stop, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stop-button";
      button.dataset.index = String(index);
      button.innerHTML = `
        <span class="stop-index">${index + 1}</span>
        <span>
          <span class="stop-name"></span>
          <span class="stop-place"></span>
        </span>
      `;
      button.querySelector(".stop-name").textContent = stop.name;
      button.querySelector(".stop-place").textContent = stop.campus;
      button.addEventListener("click", () => selectStop(index));
      fragment.append(button);
    });

    els.stopList.replaceChildren(fragment);
  }

  function selectStop(index, options = {}) {
    if (index < 0 || index >= CAMPUS_STOPS.length) {
      return;
    }

    currentIndex = index;
    const stop = CAMPUS_STOPS[index];
    const stats = stopStats[index];

    els.campusName.textContent = stop.name;
    els.campusPlace.textContent = stop.campus;
    els.campusProvider.textContent = getProviderText(stop);
    els.stopCount.textContent = `${index + 1} / ${CAMPUS_STOPS.length}`;
    els.legMiles.textContent = `${formatNumber(stats.legMiles)} mi`;
    els.routeMiles.textContent = `${formatNumber(stats.cumulativeMiles)} mi`;
    els.overlayStop.textContent = stop.name;
    els.overlayMiles.textContent = index === 0 ? "Atlantic start" : `${formatNumber(stats.cumulativeMiles)} mi from Rutgers`;
    els.dockTitle.textContent = stop.name;
    els.prevStop.disabled = index === 0;
    els.nextStop.disabled = index === CAMPUS_STOPS.length - 1;

    updateStopListSelection();
    updateMarkerSelection();

    if (map) {
      const zoom = window.matchMedia("(max-width: 720px)").matches ? 8 : 9;
      if (options.instant) {
        map.setView([stop.lat, stop.lon], zoom);
      } else {
        map.flyTo([stop.lat, stop.lon], zoom, { duration: 0.7 });
      }
      markers[index]?.openPopup();
    }

    loadResourcesForStop(index);
  }

  function updateStopListSelection() {
    const buttons = Array.from(els.stopList.querySelectorAll(".stop-button"));
    buttons.forEach((button, index) => {
      const active = index === currentIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
      if (active) {
        button.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
  }

  function updateMarkerSelection() {
    markers.forEach((marker, index) => {
      marker.setIcon(buildCampusIcon(index, index === currentIndex));
    });
  }

  async function loadResourcesForStop(index) {
    const stop = CAMPUS_STOPS[index];
    const cached = resourceCache.get(stop.name);

    if (cached) {
      renderResources(stop, cached);
      return;
    }

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    setStatus("Loading maps", "loading");
    renderResourceLoading(stop);

    try {
      const result = await fetchBestResourceSet(stop, abortController.signal);
      resourceCache.set(stop.name, result);
      renderResources(stop, result);
      setStatus("Live API", null);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error(error);

      if (isApiTokenExhaustion(error)) {
        setStatus("API tokens exhausted", "error");
        renderResourceEmpty(stop, TOKEN_WAIT_MESSAGE);
        return;
      }

      setStatus("API error", "error");
      renderResourceEmpty(stop, error.message || "The BTAA API did not return maps.");
    }
  }

  async function fetchBestResourceSet(stop, signal) {
    const attempts = buildSearchAttempts(stop);
    let lastResult = null;

    for (const attempt of attempts) {
      const payload = await fetchSearch(attempt, signal);
      const resources = normalizeResources(payload);
      const result = {
        attempt,
        total: Number(payload.meta?.totalCount || resources.length),
        resources,
      };

      lastResult = result;

      if (resources.length > 0) {
        return result;
      }
    }

    return lastResult || { attempt: attempts[0], total: 0, resources: [] };
  }

  function buildSearchAttempts(stop) {
    const attempts = [];

    if (stop.providerValues.length) {
      attempts.push({
        label: "Campus-map matches",
        q: "campus map",
        providerValues: stop.providerValues,
      });
      attempts.push({
        label: "Campus matches",
        q: "campus",
        providerValues: stop.providerValues,
      });
      attempts.push({
        label: "Local institution maps",
        q: stop.localQuery,
        providerValues: stop.providerValues,
      });
    }

    attempts.push({
      label: "Name search",
      q: stop.nameQuery,
      providerValues: [],
    });
    attempts.push({
      label: "Nearby campus-map matches",
      q: "campus map",
      providerValues: [],
      location: stop,
      distanceKm: 35,
    });

    return attempts;
  }

  async function fetchSearch(attempt, signal) {
    const response = await fetch(buildSearchUrl(attempt), {
      headers: { Accept: "application/vnd.api+json, application/json" },
      signal,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response.json();
  }

  function buildSearchUrl(attempt) {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("per_page", String(PER_PAGE));
    params.append("include_filters[gbl_resourceClass_sm][]", "Maps");

    if (attempt.q) {
      params.set("q", attempt.q);
    }

    attempt.providerValues.forEach((value) => {
      params.append("include_filters[schema_provider_s][]", value);
    });

    if (attempt.location) {
      params.set("include_filters[geo][type]", "distance");
      params.set("include_filters[geo][field]", "dcat_centroid");
      params.set("include_filters[geo][center][lat]", String(attempt.location.lat));
      params.set("include_filters[geo][center][lon]", String(attempt.location.lon));
      params.set("include_filters[geo][distance]", `${attempt.distanceKm || 35}km`);
    }

    return `${API_BASE}/search?${params.toString()}`;
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

  function normalizeResources(payload) {
    return (payload.data || []).map((item) => {
      const id = item.id || item.attributes?.ogm?.id || "";
      const ogm = item.attributes?.ogm || {};
      const ui = item.meta?.ui || {};
      const staticMap = ui.static_map || "";
      const thumbnail = ui.thumbnail_url || "";
      const generatedThumbnail = id ? `${API_BASE}/resources/${encodeURIComponent(id)}/thumbnail` : "";
      const recordUrl = `${FRONTEND_BASE}/resources/${encodeURIComponent(id)}`;
      const sourceUrl = getSourceUrl(ui, ogm) || recordUrl;

      return {
        id,
        title: ogm.dct_title_s || "Untitled map",
        provider: ogm.schema_provider_s || toText(ogm.dct_publisher_sm) || "Unknown provider",
        year: firstValue(ogm.gbl_indexYear_im) || ogm.dct_issued_s || firstValue(ogm.dct_temporal_sm) || "n.d.",
        spatial: toText(ogm.dct_spatial_sm) || "Unspecified",
        thumbnailUrl: thumbnail || staticMap || generatedThumbnail || `${API_BASE}/thumbnails/placeholder`,
        viewerUrl: thumbnail || staticMap || generatedThumbnail || `${API_BASE}/thumbnails/placeholder`,
        recordUrl,
        sourceUrl,
      };
    });
  }

  function renderResourceLoading(stop) {
    currentResources = [];
    currentResourceIndex = -1;
    els.resourceStrip.replaceChildren();
    els.resourceTitle.textContent = "Loading maps.";
    els.resourceMeta.textContent = getProviderText(stop);
    els.recordLink.hidden = true;
    showViewerMessage("Loading maps.");
  }

  function renderResources(stop, result) {
    const resources = result.resources;
    currentResources = resources;
    currentResourceIndex = -1;
    els.resourceStrip.replaceChildren();

    if (!resources.length) {
      renderResourceEmpty(stop, "No digitized campus-map matches found for this stop.");
      return;
    }

    const fragment = document.createDocumentFragment();
    resources.forEach((resource, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "resource-button";
      button.innerHTML = `
        <img alt="">
        <span class="resource-body">
          <span class="resource-title"></span>
          <span class="resource-meta">
            <span class="resource-year"></span>
            <span class="resource-provider"></span>
          </span>
        </span>
      `;

      const image = button.querySelector("img");
      image.src = resource.thumbnailUrl;
      image.alt = `${resource.title} thumbnail`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.src = `${API_BASE}/thumbnails/placeholder`;
      }, { once: true });

      button.querySelector(".resource-title").textContent = resource.title;
      button.querySelector(".resource-year").textContent = resource.year;
      button.querySelector(".resource-provider").textContent = resource.provider;
      button.addEventListener("click", () => selectResource(index));
      fragment.append(button);
    });

    els.resourceStrip.append(fragment);
    selectResource(0);
  }

  function renderResourceEmpty(stop, message) {
    currentResources = [];
    currentResourceIndex = -1;
    els.resourceTitle.textContent = stop.name;
    els.resourceMeta.textContent = getProviderText(stop);
    els.recordLink.hidden = true;
    els.resourceStrip.replaceChildren();

    const empty = document.createElement("div");
    empty.className = "empty-strip";
    empty.textContent = message;
    els.resourceStrip.append(empty);
    showViewerMessage(message);
  }

  function selectResource(index) {
    const resource = currentResources[index];
    if (!resource) {
      return;
    }

    currentResourceIndex = index;
    els.resourceStrip.querySelectorAll(".resource-button").forEach((button, buttonIndex) => {
      button.classList.toggle("active", buttonIndex === index);
    });

    els.resourceTitle.textContent = resource.title;
    els.resourceMeta.textContent = `${resource.year} | ${resource.provider} | ${resource.spatial}`;
    els.recordLink.href = resource.recordUrl;
    els.recordLink.hidden = false;
    els.viewerEmpty.hidden = true;
    els.viewerImage.hidden = false;
    els.viewerImage.alt = resource.title;
    els.viewerImage.onerror = () => {
      showViewerMessage("Map image unavailable.");
    };
    els.viewerImage.src = resource.viewerUrl;
    resetViewer();
  }

  function showViewerMessage(message) {
    els.viewerImage.hidden = true;
    els.viewerEmpty.hidden = false;
    els.viewerEmpty.querySelector("p").textContent = message;
  }

  function handleViewerWheel(event) {
    if (currentResourceIndex < 0) {
      return;
    }

    event.preventDefault();
    zoomViewer(event.deltaY < 0 ? 1.14 : 0.88);
  }

  function beginViewerDrag(event) {
    if (currentResourceIndex < 0) {
      return;
    }

    viewer.dragging = true;
    viewer.lastX = event.clientX;
    viewer.lastY = event.clientY;
    els.viewerStage.classList.add("is-dragging");
    els.viewerStage.setPointerCapture?.(event.pointerId);
  }

  function dragViewer(event) {
    if (!viewer.dragging) {
      return;
    }

    viewer.x += event.clientX - viewer.lastX;
    viewer.y += event.clientY - viewer.lastY;
    viewer.lastX = event.clientX;
    viewer.lastY = event.clientY;
    applyViewerTransform();
  }

  function endViewerDrag(event) {
    if (!viewer.dragging) {
      return;
    }

    viewer.dragging = false;
    els.viewerStage.classList.remove("is-dragging");
    els.viewerStage.releasePointerCapture?.(event.pointerId);
  }

  function zoomViewer(multiplier) {
    if (currentResourceIndex < 0) {
      return;
    }

    viewer.scale = clamp(viewer.scale * multiplier, 0.65, 5);
    applyViewerTransform();
  }

  function resetViewer() {
    viewer.scale = 1;
    viewer.x = 0;
    viewer.y = 0;
    applyViewerTransform();
  }

  function applyViewerTransform() {
    els.viewerImage.style.transform = `translate(-50%, -50%) translate(${viewer.x}px, ${viewer.y}px) scale(${viewer.scale})`;
  }

  function buildStopStats() {
    let cumulativeMiles = 0;

    return CAMPUS_STOPS.map((stop, index) => {
      const legMiles = index === 0 ? 0 : Math.round(haversineMiles(CAMPUS_STOPS[index - 1], stop));
      cumulativeMiles += legMiles;
      return { legMiles, cumulativeMiles };
    });
  }

  function haversineMiles(a, b) {
    const radiusMiles = 3958.8;
    const dLat = toRadians(b.lat - a.lat);
    const dLon = toRadians(b.lon - a.lon);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * radiusMiles * Math.asin(Math.sqrt(h));
  }

  function toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  function getProviderText(stop) {
    if (stop.providerValues.length) {
      return stop.providerValues.join(" / ");
    }

    return "Name search across the API";
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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setStatus(message, mode) {
    els.apiStatus.textContent = message;
    els.apiStatus.classList.toggle("is-loading", mode === "loading");
    els.apiStatus.classList.toggle("is-error", mode === "error");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
