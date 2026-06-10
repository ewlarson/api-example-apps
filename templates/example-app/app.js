(function () {
  const API_BASE = "https://geodev.btaa.org/api/v1";
  const FRONTEND_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu";
  const TOKEN_WAIT_MESSAGE = "We're out of API tokens. Please wait a minute before continuing.";

  const els = {
    form: document.querySelector("#searchForm"),
    query: document.querySelector("#query"),
    resourceClass: document.querySelector("#resourceClass"),
    perPage: document.querySelector("#perPage"),
    presets: Array.from(document.querySelectorAll(".preset")),
    summaryTitle: document.querySelector("#summaryTitle"),
    summaryText: document.querySelector("#summaryText"),
    endpointLink: document.querySelector("#endpointLink"),
    totalCount: document.querySelector("#totalCount"),
    returnedCount: document.querySelector("#returnedCount"),
    queryTime: document.querySelector("#queryTime"),
    resultsHeading: document.querySelector("#resultsHeading"),
    apiStatus: document.querySelector("#apiStatus"),
    emptyState: document.querySelector("#emptyState"),
    resultsList: document.querySelector("#resultsList"),
    resultTemplate: document.querySelector("#resultTemplate"),
  };

  let abortController = null;

  function init() {
    els.form.addEventListener("submit", handleSubmit);
    els.presets.forEach((button) => button.addEventListener("click", handlePreset));

    renderIcons();
    runSearch();
  }

  function handleSubmit(event) {
    event.preventDefault();
    markPresetActive(null);
    runSearch();
  }

  function handlePreset(event) {
    const button = event.currentTarget;
    els.query.value = button.dataset.query || "";
    els.resourceClass.value = button.dataset.class || "";
    markPresetActive(button);
    runSearch();
  }

  function markPresetActive(activeButton) {
    els.presets.forEach((button) => button.classList.toggle("active", button === activeButton));
  }

  async function runSearch() {
    const query = els.query.value.trim();

    if (!query) {
      setStatus("Enter a query", "error");
      renderEmpty("Add a search term to load records.");
      resetMetrics();
      return;
    }

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    setStatus("Querying BTAA", "loading");
    renderEmpty("Loading records.");

    try {
      const url = buildSearchUrl();
      const payload = await fetchJson(url, abortController.signal);
      const records = normalizeRecords(payload);

      renderSummary(payload, records, url);
      renderResults(records);
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
      renderEmpty("The BTAA API did not return results.");
      els.summaryTitle.textContent = "API error";
      els.summaryText.textContent = error.message || "Something went wrong.";
      resetMetrics();
    }
  }

  function buildSearchUrl() {
    const params = new URLSearchParams();
    params.set("q", els.query.value.trim());
    params.set("per_page", els.perPage.value);

    if (els.resourceClass.value) {
      params.append("include_filters[gbl_resourceClass_sm][]", els.resourceClass.value);
    }

    return `${API_BASE}/search?${params.toString()}`;
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

  function normalizeRecords(payload) {
    return (payload.data || []).map((record) => {
      const ogm = record.attributes?.ogm || {};
      const title = toText(ogm.dct_title_s) || toText(ogm.title) || "Untitled record";
      const id = record.id || ogm.id;

      return {
        id,
        title,
        description: toText(ogm.dct_description_sm) || "No description provided.",
        provider: toText(ogm.schema_provider_s) || "Unknown provider",
        resourceClass: toText(ogm.gbl_resourceClass_sm) || "Resource",
        recordUrl: buildRecordUrl(record, id),
        apiUrl: id ? `${API_BASE}/resources/${encodeURIComponent(id)}` : buildSearchUrl(),
      };
    });
  }

  function buildRecordUrl(record, id) {
    const uiUrl = record.meta?.ui?.url;
    if (uiUrl) {
      return uiUrl.startsWith("http") ? uiUrl : `${FRONTEND_BASE}${uiUrl}`;
    }

    return id ? `${FRONTEND_BASE}/catalog/${encodeURIComponent(id)}` : `${FRONTEND_BASE}/search`;
  }

  function renderSummary(payload, records, url) {
    const total = Number(payload.meta?.totalCount || records.length);
    const queryTime = payload.meta?.queryTime?.totalResponseTime || "";
    const resourceClass = els.resourceClass.value ? ` in ${els.resourceClass.value}` : "";

    els.summaryTitle.textContent = `Search: ${els.query.value.trim()}`;
    els.summaryText.textContent = `Found ${formatNumber(total)} matching records${resourceClass}. Showing ${records.length}.`;
    els.endpointLink.href = url;
    els.totalCount.textContent = formatNumber(total);
    els.returnedCount.textContent = formatNumber(records.length);
    els.queryTime.textContent = queryTime ? `${queryTime} ms` : "-";
    els.resultsHeading.textContent = records.length ? "Results" : "No results";
  }

  function renderResults(records) {
    els.resultsList.innerHTML = "";

    if (!records.length) {
      renderEmpty("Try a broader search or another resource class.");
      return;
    }

    els.emptyState.hidden = true;
    const fragment = document.createDocumentFragment();

    records.forEach((record) => {
      const card = els.resultTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector(".resource-class").textContent = record.resourceClass;
      card.querySelector(".provider").textContent = record.provider;
      card.querySelector("h3").textContent = record.title;
      card.querySelector(".description").textContent = record.description;
      card.querySelector(".record-link").href = record.recordUrl;
      card.querySelector(".api-link").href = record.apiUrl;
      fragment.appendChild(card);
    });

    els.resultsList.appendChild(fragment);
    renderIcons();
  }

  function renderEmpty(message) {
    els.resultsList.innerHTML = "";
    els.emptyState.hidden = false;
    els.emptyState.querySelector("p").textContent = message;
    renderIcons();
  }

  function resetMetrics() {
    els.totalCount.textContent = "0";
    els.returnedCount.textContent = "0";
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
