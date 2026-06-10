(function () {
  const API_BASE = "https://geodev.btaa.org/api/v1";
  const FRONTEND_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu";
  const TOKEN_WAIT_MESSAGE = "We're out of API tokens. Please wait a minute before continuing.";

  const els = {
    form: document.querySelector("#searchForm"),
    query: document.querySelector("#query"),
    resourceClass: document.querySelector("#resourceClass"),
    inspectCount: document.querySelector("#inspectCount"),
    presets: Array.from(document.querySelectorAll(".preset")),
    summaryTitle: document.querySelector("#summaryTitle"),
    summaryText: document.querySelector("#summaryText"),
    endpointLink: document.querySelector("#endpointLink"),
    seedCount: document.querySelector("#seedCount"),
    candidateCount: document.querySelector("#candidateCount"),
    queryTime: document.querySelector("#queryTime"),
    resultsHeading: document.querySelector("#resultsHeading"),
    apiStatus: document.querySelector("#apiStatus"),
    emptyState: document.querySelector("#emptyState"),
    resultsList: document.querySelector("#resultsList"),
    clusterTemplate: document.querySelector("#clusterTemplate"),
    candidateTemplate: document.querySelector("#candidateTemplate"),
  };

  let abortController = null;

  function init() {
    els.form.addEventListener("submit", handleSubmit);
    els.presets.forEach((button) => button.addEventListener("click", handlePreset));

    renderIcons();
    runDuplicateScan();
  }

  function handleSubmit(event) {
    event.preventDefault();
    markPresetActive(null);
    runDuplicateScan();
  }

  function handlePreset(event) {
    const button = event.currentTarget;
    els.query.value = button.dataset.query || "";
    els.resourceClass.value = button.dataset.class || "";
    markPresetActive(button);
    runDuplicateScan();
  }

  function markPresetActive(activeButton) {
    els.presets.forEach((button) => button.classList.toggle("active", button === activeButton));
  }

  async function runDuplicateScan() {
    const query = els.query.value.trim();

    if (!query) {
      setStatus("Enter a query", "error");
      renderEmpty("Add a search term to inspect records.");
      resetMetrics();
      return;
    }

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    setStatus("Searching records", "loading");
    renderEmpty("Finding seed records.");
    resetMetrics();

    try {
      const url = buildSearchUrl();
      const payload = await fetchJson(url, abortController.signal);
      const seeds = normalizeSearchRecords(payload);

      renderSummary(payload, seeds, [], url, "Loading similar records.");

      const clusters = await loadSimilarClusters(seeds, abortController.signal);

      renderSummary(payload, seeds, clusters, url);
      renderClusters(clusters);
      setStatus("Live API", null);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error(error);

      if (isApiTokenExhaustion(error)) {
        setStatus("API tokens exhausted", "error");
        renderEmpty(TOKEN_WAIT_MESSAGE);
        els.summaryTitle.textContent = "API tokens exhausted";
        els.summaryText.textContent = TOKEN_WAIT_MESSAGE;
        resetMetrics();
        return;
      }

      setStatus("API error", "error");
      renderEmpty("The BTAA API did not return duplicate candidates.");
      els.summaryTitle.textContent = "API error";
      els.summaryText.textContent = error.message || "Something went wrong.";
      resetMetrics();
    }
  }

  function buildSearchUrl() {
    const params = new URLSearchParams();
    params.set("q", els.query.value.trim());
    params.set("per_page", els.inspectCount.value);

    if (els.resourceClass.value) {
      params.append("include_filters[gbl_resourceClass_sm][]", els.resourceClass.value);
    }

    return `${API_BASE}/search?${params.toString()}`;
  }

  async function loadSimilarClusters(seeds, signal) {
    if (!seeds.length) {
      return [];
    }

    const details = await Promise.all(
      seeds.map(async (seed) => {
        const payload = await fetchJson(seed.apiUrl, signal);
        return normalizeResourceDetail(payload, seed);
      }),
    );

    return details
      .map((record) => ({
        seed: record,
        candidates: scoreCandidates(record, record.similarItems).slice(0, 6),
      }))
      .filter((cluster) => cluster.candidates.length > 0);
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.api+json, application/json" },
      signal,
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

  function normalizeSearchRecords(payload) {
    return (payload.data || []).map((record) => normalizeResource(record));
  }

  function normalizeResourceDetail(payload, fallback) {
    const resource = payload.data ? normalizeResource(payload.data) : fallback;
    const similarItems = payload.data?.meta?.ui?.similar_items || [];

    return {
      ...fallback,
      ...resource,
      similarItems: normalizeSimilarItems(similarItems, resource.id || fallback.id),
    };
  }

  function normalizeResource(record) {
    const ogm = record.attributes?.ogm || {};
    const id = record.id || ogm.id;

    return {
      id,
      title: toText(ogm.dct_title_s) || toText(ogm.title) || "Untitled record",
      description: toText(ogm.dct_description_sm) || "No description provided.",
      provider: toText(ogm.schema_provider_s) || "Unknown provider",
      resourceClass: toText(ogm.gbl_resourceClass_sm) || "Resource",
      years: toText(ogm.gbl_dateRange_drsim || ogm.dct_temporal_sm),
      recordUrl: buildRecordUrl(record, id),
      apiUrl: id ? `${API_BASE}/resources/${encodeURIComponent(id)}` : buildSearchUrl(),
    };
  }

  function normalizeSimilarItems(items, seedId) {
    return items
      .filter((item) => item.id && item.id !== seedId)
      .map((item) => ({
        id: item.id,
        title: item.title || "Untitled record",
        resourceClass: toText(item.gbl_resourceClass_sm) || "Resource",
        years: toText(item.temporal_coverage || item.gbl_indexYear_im),
        thumbnailUrl: item.thumbnail_url || "",
        recordUrl: `${FRONTEND_BASE}/resources/${encodeURIComponent(item.id)}`,
        apiUrl: `${API_BASE}/resources/${encodeURIComponent(item.id)}`,
      }));
  }

  function scoreCandidates(seed, candidates) {
    return candidates
      .map((candidate) => {
        const titleScore = titleSimilarity(seed.title, candidate.title);
        const classMatch = seed.resourceClass === candidate.resourceClass;
        const yearMatch = Boolean(seed.years && candidate.years && seed.years === candidate.years);
        const confidence = titleScore >= 0.65 || (titleScore >= 0.42 && classMatch) || (classMatch && yearMatch)
          ? "Stronger candidate"
          : "Similar record";

        return {
          ...candidate,
          confidence,
          signals: buildSignals(titleScore, classMatch, yearMatch),
          sortScore: titleScore + (classMatch ? 0.2 : 0) + (yearMatch ? 0.15 : 0),
        };
      })
      .sort((a, b) => b.sortScore - a.sortScore);
  }

  function titleSimilarity(first, second) {
    const firstTokens = titleTokens(first);
    const secondTokens = titleTokens(second);

    if (!firstTokens.length || !secondTokens.length) {
      return 0;
    }

    const overlap = firstTokens.filter((token) => secondTokens.includes(token)).length;
    const uniqueCount = new Set([...firstTokens, ...secondTokens]).size;

    return overlap / uniqueCount;
  }

  function titleTokens(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((token) => token.length > 2 && !["the", "and", "for", "data", "map", "maps"].includes(token));
  }

  function buildSignals(titleScore, classMatch, yearMatch) {
    const signals = [];

    if (titleScore >= 0.42) {
      signals.push("title overlap");
    }

    if (classMatch) {
      signals.push("same class");
    }

    if (yearMatch) {
      signals.push("same date");
    }

    return signals.length ? signals.join(", ") : "Elasticsearch similar-record match";
  }

  function buildRecordUrl(record, id) {
    const uiUrl = record.meta?.ui?.url;
    if (uiUrl) {
      return uiUrl.startsWith("http") ? uiUrl : `${FRONTEND_BASE}${uiUrl}`;
    }

    return id ? `${FRONTEND_BASE}/resources/${encodeURIComponent(id)}` : `${FRONTEND_BASE}/search`;
  }

  function renderSummary(payload, seeds, clusters, url, pendingMessage) {
    const total = Number(payload.meta?.totalCount || seeds.length);
    const queryTime = payload.meta?.queryTime?.totalResponseTime || "";
    const resourceClass = els.resourceClass.value ? ` in ${els.resourceClass.value}` : "";
    const candidateTotal = clusters.reduce((sum, cluster) => sum + cluster.candidates.length, 0);

    els.summaryTitle.textContent = `Duplicate scan: ${els.query.value.trim()}`;
    els.summaryText.textContent = pendingMessage
      || `Inspected ${seeds.length} of ${formatNumber(total)} matching records${resourceClass}; found ${candidateTotal} similar-record candidates.`;
    els.endpointLink.href = url;
    els.seedCount.textContent = formatNumber(seeds.length);
    els.candidateCount.textContent = formatNumber(candidateTotal);
    els.queryTime.textContent = queryTime ? `${queryTime}` : "-";
    els.resultsHeading.textContent = clusters.length ? "Possible duplicate groups" : "No candidates";
  }

  function renderClusters(clusters) {
    els.resultsList.innerHTML = "";

    if (!clusters.length) {
      renderEmpty("No similar-record candidates were returned for this scan.");
      return;
    }

    els.emptyState.hidden = true;
    const fragment = document.createDocumentFragment();

    clusters.forEach((cluster) => {
      const card = els.clusterTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector(".resource-class").textContent = cluster.seed.resourceClass;
      card.querySelector(".provider").textContent = cluster.seed.provider;
      card.querySelector("h3").textContent = cluster.seed.title;
      card.querySelector(".description").textContent = cluster.seed.description;
      card.querySelector(".record-link").href = cluster.seed.recordUrl;
      card.querySelector(".api-link").href = cluster.seed.apiUrl;
      card.querySelector(".candidate-count").textContent = `${cluster.candidates.length} candidates`;

      const candidateList = card.querySelector(".candidate-list");
      cluster.candidates.forEach((candidate) => {
        candidateList.appendChild(renderCandidate(candidate));
      });

      fragment.appendChild(card);
    });

    els.resultsList.appendChild(fragment);
    renderIcons();
  }

  function renderCandidate(candidate) {
    const row = els.candidateTemplate.content.firstElementChild.cloneNode(true);
    const thumbnail = row.querySelector(".candidate-thumb");

    row.querySelector(".candidate-title").textContent = candidate.title;
    row.querySelector(".candidate-meta").textContent = [candidate.resourceClass, candidate.years].filter(Boolean).join(" | ");
    row.querySelector(".candidate-confidence").textContent = candidate.confidence;
    row.querySelector(".candidate-signals").textContent = candidate.signals;
    row.querySelector(".candidate-record-link").href = candidate.recordUrl;
    row.querySelector(".candidate-api-link").href = candidate.apiUrl;

    if (candidate.thumbnailUrl) {
      thumbnail.src = candidate.thumbnailUrl;
      thumbnail.alt = "";
    } else {
      thumbnail.remove();
    }

    return row;
  }

  function renderEmpty(message) {
    els.resultsList.innerHTML = "";
    els.emptyState.hidden = false;
    els.emptyState.querySelector("p").textContent = message;
    renderIcons();
  }

  function resetMetrics() {
    els.seedCount.textContent = "0";
    els.candidateCount.textContent = "0";
    els.queryTime.textContent = "-";
  }

  function setStatus(label, status) {
    els.apiStatus.textContent = label;
    els.apiStatus.classList.toggle("is-loading", status === "loading");
    els.apiStatus.classList.toggle("is-error", status === "error");
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }

    return value || "";
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
