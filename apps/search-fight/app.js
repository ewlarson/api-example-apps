(function () {
  const API_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1";
  const FRONTEND_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu";
  const FACET_NAME = "gbl_indexYear_im";
  const FACET_PER_PAGE = 100;
  const MAX_FACET_PAGES = 8;
  const SAMPLE_COUNT = 4;
  const TOKEN_WAIT_MESSAGE = "We're out of API tokens. Please wait a minute before continuing.";

  const els = {
    form: document.querySelector("#fightForm"),
    queryA: document.querySelector("#queryA"),
    queryB: document.querySelector("#queryB"),
    presets: Array.from(document.querySelectorAll(".preset")),
    modeButtons: Array.from(document.querySelectorAll(".mode-button")),
    shareMode: document.querySelector("#shareMode"),
    apiStatus: document.querySelector("#apiStatus"),
    queryALabel: document.querySelector("#queryALabel"),
    queryBLabel: document.querySelector("#queryBLabel"),
    queryATotal: document.querySelector("#queryATotal"),
    queryBTotal: document.querySelector("#queryBTotal"),
    queryAYears: document.querySelector("#queryAYears"),
    queryBYears: document.querySelector("#queryBYears"),
    queryABest: document.querySelector("#queryABest"),
    queryBBest: document.querySelector("#queryBBest"),
    queryALink: document.querySelector("#queryALink"),
    queryBLink: document.querySelector("#queryBLink"),
    winnerTitle: document.querySelector("#winnerTitle"),
    winnerText: document.querySelector("#winnerText"),
    winnerMeter: document.querySelector(".winner-meter"),
    legendA: document.querySelector("#legendA"),
    legendB: document.querySelector("#legendB"),
    timelineCanvas: document.querySelector("#timelineCanvas"),
    chartMessage: document.querySelector("#chartMessage"),
    periodList: document.querySelector("#periodList"),
    sampleGrid: document.querySelector("#sampleGrid"),
  };

  let abortController = null;
  let bucketMode = "decade";
  let currentComparison = null;

  function init() {
    els.form.addEventListener("submit", handleSubmit);
    els.presets.forEach((button) => button.addEventListener("click", handlePreset));
    els.modeButtons.forEach((button) => button.addEventListener("click", handleBucketMode));
    els.shareMode.addEventListener("change", renderComparison);
    window.addEventListener("resize", drawTimeline);

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(drawTimeline);
      observer.observe(els.timelineCanvas);
    }

    renderIcons();
    compare();
  }

  function handleSubmit(event) {
    event.preventDefault();
    compare();
  }

  function handlePreset(event) {
    const button = event.currentTarget;
    els.queryA.value = button.dataset.a || "";
    els.queryB.value = button.dataset.b || "";
    compare();
  }

  function handleBucketMode(event) {
    const button = event.currentTarget;
    bucketMode = button.dataset.bucket || "decade";
    els.modeButtons.forEach((modeButton) => modeButton.classList.toggle("active", modeButton === button));
    renderComparison();
  }

  async function compare() {
    const queryA = els.queryA.value.trim();
    const queryB = els.queryB.value.trim();

    if (!queryA || !queryB) {
      setStatus("Enter two searches", "error");
      showChartMessage("Enter two keyword searches to compare.");
      return;
    }

    if (queryA.toLocaleLowerCase() === queryB.toLocaleLowerCase()) {
      setStatus("Pick different terms", "error");
      showChartMessage("Choose two different searches for a head-to-head result.");
      return;
    }

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    setStatus("Querying BTAA", "loading");
    showChartMessage("Loading indexed-year counts.");

    try {
      const [left, right] = await Promise.all([
        fetchComparison(queryA, abortController.signal),
        fetchComparison(queryB, abortController.signal),
      ]);

      currentComparison = { left, right };
      renderComparison();
      setStatus("Live API", null);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error(error);

      if (isApiTokenExhaustion(error)) {
        setStatus("API tokens exhausted", "error");
        showChartMessage(TOKEN_WAIT_MESSAGE);
        return;
      }

      setStatus("API error", "error");
      showChartMessage(error.message || "The BTAA API did not return search counts.");
    }
  }

  async function fetchComparison(query, signal) {
    const [summary, firstFacetPage] = await Promise.all([
      fetchJson(buildSummaryUrl(query), signal),
      fetchJson(buildFacetUrl(query, 1), signal),
    ]);

    const totalFacetPages = Math.min(Number(firstFacetPage.meta?.totalPages || 1), MAX_FACET_PAGES);
    const facetRequests = [];
    for (let page = 2; page <= totalFacetPages; page += 1) {
      facetRequests.push(fetchJson(buildFacetUrl(query, page), signal));
    }

    const facetPages = [firstFacetPage, ...(await Promise.all(facetRequests))];

    return {
      query,
      total: Number(summary.meta?.totalCount || 0),
      years: normalizeYearFacet(facetPages),
      samples: normalizeSamples(summary.data || []),
      suggestions: summary.meta?.spellingSuggestions || [],
      responseTime: summary.meta?.queryTime?.totalResponseTime || "",
      truncatedFacets: Number(firstFacetPage.meta?.totalPages || 1) > MAX_FACET_PAGES,
    };
  }

  function buildSummaryUrl(query) {
    const params = new URLSearchParams({
      q: query,
      page: "1",
      per_page: String(SAMPLE_COUNT),
      sort: "relevance",
    });

    return `${API_BASE}/search?${params.toString()}`;
  }

  function buildFacetUrl(query, page) {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      per_page: String(FACET_PER_PAGE),
      sort: "alpha_asc",
    });

    return `${API_BASE}/search/facets/${FACET_NAME}?${params.toString()}`;
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

  function normalizeYearFacet(facetPages) {
    const years = new Map();

    facetPages.forEach((page) => {
      (page.data || []).forEach((item) => {
        const attributes = item.attributes || {};
        const year = Number(attributes.value ?? item.id);
        const hits = Number(attributes.hits || attributes.count || 0);

        if (Number.isInteger(year) && year >= 1000 && year <= 2100 && hits > 0) {
          years.set(year, (years.get(year) || 0) + hits);
        }
      });
    });

    return years;
  }

  function normalizeSamples(items) {
    return items.map((item) => {
      const ogm = item.attributes?.ogm || {};
      const ui = item.meta?.ui || {};
      const id = item.id || ogm.id;

      return {
        id,
        title: ogm.dct_title_s || "Untitled resource",
        provider: ogm.schema_provider_s || toText(ogm.dct_publisher_sm) || "Unknown provider",
        resourceClass: toText(ogm.gbl_resourceClass_sm) || "Resource",
        spatial: toText(ogm.dct_spatial_sm) || "Unspecified place",
        year: firstValue(ogm.gbl_indexYear_im) || firstValue(ogm.dct_temporal_sm) || "",
        recordUrl: id ? `${FRONTEND_BASE}/resources/${encodeURIComponent(id)}` : `${FRONTEND_BASE}/search`,
        thumbnailUrl: ui.thumbnail_url || ui.static_map || "",
      };
    });
  }

  function renderComparison() {
    if (!currentComparison) {
      return;
    }

    const { left, right } = currentComparison;
    const timeline = buildTimeline(left, right);

    els.queryALabel.textContent = left.query;
    els.queryBLabel.textContent = right.query;
    els.legendA.textContent = left.query;
    els.legendB.textContent = right.query;
    els.queryALink.href = buildFrontendSearchUrl(left.query);
    els.queryBLink.href = buildFrontendSearchUrl(right.query);

    renderScore(left, "left", timeline);
    renderScore(right, "right", timeline);
    renderWinner(left, right, timeline);
    renderPeriods(left, right, timeline);
    renderSamples(left, right);
    drawTimeline();
    renderIcons();
  }

  function renderScore(comparison, side, timeline) {
    const prefix = side === "left" ? "queryA" : "queryB";
    const totalEl = els[`${prefix}Total`];
    const yearsEl = els[`${prefix}Years`];
    const bestEl = els[`${prefix}Best`];
    const key = side === "left" ? "leftCount" : "rightCount";
    const bestPeriod = timeline
      .filter((period) => period[key] > 0)
      .sort((a, b) => b[key] - a[key])[0];

    totalEl.textContent = formatNumber(comparison.total);
    yearsEl.textContent = formatNumber(comparison.years.size);
    bestEl.textContent = bestPeriod ? `${bestPeriod.label} (${formatCompact(bestPeriod[key])})` : "-";
  }

  function renderWinner(left, right, timeline) {
    const combinedTotal = left.total + right.total;
    const leftShare = combinedTotal ? (left.total / combinedTotal) * 100 : 50;
    const rightShare = 100 - leftShare;
    const leftPeriods = timeline.filter((period) => period.leftCount > period.rightCount).length;
    const rightPeriods = timeline.filter((period) => period.rightCount > period.leftCount).length;
    const tiedPeriods = timeline.filter((period) => period.leftCount === period.rightCount && period.leftCount > 0).length;

    els.winnerMeter.style.setProperty("--meter-a", `${leftShare}%`);
    els.winnerMeter.style.setProperty("--meter-b", `${rightShare}%`);

    if (left.total === right.total) {
      els.winnerTitle.textContent = "Dead heat";
      els.winnerText.textContent = `${left.query} and ${right.query} both return ${formatNumber(left.total)} matches.`;
      return;
    }

    const winner = left.total > right.total ? left : right;
    const loser = left.total > right.total ? right : left;
    const lead = Math.abs(left.total - right.total);
    const periodLead = left.total > right.total ? leftPeriods : rightPeriods;
    const totalActivePeriods = leftPeriods + rightPeriods + tiedPeriods;

    els.winnerTitle.textContent = winner.query;
    els.winnerText.textContent = `${winner.query} leads by ${formatNumber(lead)} matches and wins ${formatNumber(periodLead)} of ${formatNumber(totalActivePeriods)} active ${bucketMode === "decade" ? "periods" : "years"} over ${loser.query}.`;
  }

  function renderPeriods(left, right, timeline) {
    els.periodList.textContent = "";

    const periods = timeline
      .map((period) => ({
        ...period,
        combined: period.leftCount + period.rightCount,
      }))
      .filter((period) => period.combined > 0)
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 10);

    if (!periods.length) {
      els.periodList.append(createEmptyNote("No indexed-year facet values were returned for these searches."));
      return;
    }

    periods.forEach((period) => {
      const row = document.createElement("article");
      const label = document.createElement("div");
      const bar = document.createElement("div");
      const leftBar = document.createElement("span");
      const rightBar = document.createElement("span");
      const meta = document.createElement("div");
      const leftShare = period.combined ? (period.leftCount / period.combined) * 100 : 50;
      const winner = period.leftCount === period.rightCount
        ? "Tie"
        : period.leftCount > period.rightCount
          ? left.query
          : right.query;

      row.className = "period-row";
      label.className = "period-label";
      bar.className = "split-bar";
      meta.className = "period-meta";

      label.textContent = period.label;
      bar.style.setProperty("--split-a", `${leftShare}%`);
      bar.style.setProperty("--split-b", `${100 - leftShare}%`);
      meta.textContent = `${winner}: ${formatCompact(Math.max(period.leftCount, period.rightCount))}`;

      bar.append(leftBar, rightBar);
      row.append(label, bar, meta);
      els.periodList.append(row);
    });
  }

  function renderSamples(left, right) {
    els.sampleGrid.textContent = "";
    els.sampleGrid.append(createSampleColumn(left, "Search one"), createSampleColumn(right, "Search two"));
  }

  function createSampleColumn(comparison, label) {
    const column = document.createElement("div");
    const heading = document.createElement("h3");
    const list = document.createElement("div");

    column.className = "sample-column";
    heading.textContent = `${label}: ${comparison.query}`;
    list.className = "sample-list";

    if (!comparison.samples.length) {
      list.append(createEmptyNote("No sample results returned."));
    } else {
      comparison.samples.forEach((sample) => list.append(createSampleItem(sample)));
    }

    column.append(heading, list);
    return column;
  }

  function createSampleItem(sample) {
    const item = document.createElement("article");
    const title = document.createElement("h4");
    const link = document.createElement("a");
    const meta = document.createElement("p");
    const details = [sample.year, sample.resourceClass, sample.provider].filter(Boolean).join(" | ");

    item.className = "sample-item";
    link.href = sample.recordUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = sample.title;
    title.append(link);
    meta.textContent = details || sample.spatial;

    item.append(title, meta);
    return item;
  }

  function createEmptyNote(message) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = message;
    return note;
  }

  function buildTimeline(left, right) {
    const leftBuckets = bucketize(left.years);
    const rightBuckets = bucketize(right.years);
    const keys = Array.from(new Set([...leftBuckets.keys(), ...rightBuckets.keys()])).sort((a, b) => a - b);

    if (!keys.length) {
      return [];
    }

    const step = bucketMode === "decade" ? 10 : 1;
    const start = keys[0];
    const end = keys[keys.length - 1];
    const timeline = [];

    for (let key = start; key <= end; key += step) {
      timeline.push({
        key,
        label: formatPeriod(key),
        leftCount: leftBuckets.get(key) || 0,
        rightCount: rightBuckets.get(key) || 0,
      });
    }

    return timeline;
  }

  function bucketize(years) {
    const buckets = new Map();
    years.forEach((count, year) => {
      const key = bucketMode === "decade" ? Math.floor(year / 10) * 10 : year;
      buckets.set(key, (buckets.get(key) || 0) + count);
    });
    return buckets;
  }

  function drawTimeline() {
    const canvas = els.timelineCanvas;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!currentComparison) {
      return;
    }

    const { left, right } = currentComparison;
    const timeline = buildTimeline(left, right);
    const points = timeline.filter((period) => period.leftCount > 0 || period.rightCount > 0);

    if (!points.length) {
      showChartMessage("No indexed-year counts were returned for these searches.");
      return;
    }

    clearChartMessage();

    const styles = getComputedStyle(document.documentElement);
    const colorLeft = styles.getPropertyValue("--accent-teal").trim() || "#0f766e";
    const colorRight = styles.getPropertyValue("--accent-rose").trim() || "#b42318";
    const colorGrid = styles.getPropertyValue("--border").trim() || "#d9e1e8";
    const colorText = styles.getPropertyValue("--text-soft").trim() || "#4b5563";
    const padding = { top: 24, right: 20, bottom: 42, left: 62 };
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const plotHeight = Math.max(1, height - padding.top - padding.bottom);
    const values = timeline.flatMap((period) => [
      chartValue(period.leftCount, left.total),
      chartValue(period.rightCount, right.total),
    ]);
    const maxValue = getNiceMax(Math.max(...values, 1));

    drawGrid(ctx, {
      width,
      height,
      padding,
      plotWidth,
      plotHeight,
      maxValue,
      colorGrid,
      colorText,
    });

    drawXAxis(ctx, timeline, {
      padding,
      plotWidth,
      plotHeight,
      colorText,
    });

    drawSeries(ctx, timeline, left.total, {
      key: "leftCount",
      color: colorLeft,
      padding,
      plotWidth,
      plotHeight,
      maxValue,
    });

    drawSeries(ctx, timeline, right.total, {
      key: "rightCount",
      color: colorRight,
      padding,
      plotWidth,
      plotHeight,
      maxValue,
    });
  }

  function drawGrid(ctx, config) {
    const { padding, plotWidth, plotHeight, maxValue, colorGrid, colorText } = config;
    const ticks = 4;

    ctx.save();
    ctx.strokeStyle = colorGrid;
    ctx.fillStyle = colorText;
    ctx.lineWidth = 1;
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= ticks; i += 1) {
      const value = (maxValue / ticks) * i;
      const y = padding.top + plotHeight - (plotHeight * i) / ticks;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
      ctx.fillText(formatAxisValue(value), padding.left - 10, y);
    }

    ctx.restore();
  }

  function drawXAxis(ctx, timeline, config) {
    const { padding, plotWidth, plotHeight, colorText } = config;
    const labelIndexes = getAxisLabelIndexes(timeline.length);

    ctx.save();
    ctx.fillStyle = colorText;
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textBaseline = "top";

    labelIndexes.forEach((index) => {
      const x = xForIndex(index, timeline.length, padding, plotWidth);
      ctx.textAlign = index === 0 ? "left" : index === timeline.length - 1 ? "right" : "center";
      ctx.fillText(timeline[index].label, x, padding.top + plotHeight + 14);
    });

    ctx.restore();
  }

  function drawSeries(ctx, timeline, total, config) {
    const { key, color, padding, plotWidth, plotHeight, maxValue } = config;
    const baseline = padding.top + plotHeight;
    const points = timeline.map((period, index) => ({
      x: xForIndex(index, timeline.length, padding, plotWidth),
      y: yForValue(chartValue(period[key], total), maxValue, padding, plotHeight),
      value: period[key],
    }));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.globalAlpha = 0.1;
    ctx.lineTo(points[points.length - 1].x, baseline);
    ctx.lineTo(points[0].x, baseline);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    if (points.length <= 80) {
      points.forEach((point) => {
        if (point.value <= 0) {
          return;
        }

        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();
  }

  function chartValue(count, total) {
    if (!els.shareMode.checked) {
      return count;
    }

    return total ? (count / total) * 100 : 0;
  }

  function xForIndex(index, count, padding, plotWidth) {
    if (count <= 1) {
      return padding.left + plotWidth / 2;
    }

    return padding.left + (plotWidth * index) / (count - 1);
  }

  function yForValue(value, maxValue, padding, plotHeight) {
    return padding.top + plotHeight - (plotHeight * value) / maxValue;
  }

  function getAxisLabelIndexes(count) {
    if (count <= 1) {
      return [0];
    }

    const labels = new Set([0, count - 1]);
    const segments = Math.min(4, count - 1);
    for (let i = 1; i < segments; i += 1) {
      labels.add(Math.round((i * (count - 1)) / segments));
    }
    return Array.from(labels).sort((a, b) => a - b);
  }

  function getNiceMax(value) {
    if (value <= 10) {
      return Math.ceil(value);
    }

    const magnitude = 10 ** Math.floor(Math.log10(value));
    const normalized = value / magnitude;
    const nice = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }

  function formatAxisValue(value) {
    if (els.shareMode.checked) {
      return `${Math.round(value)}%`;
    }

    return formatCompact(value);
  }

  function formatPeriod(year) {
    return bucketMode === "decade" ? `${year}s` : String(year);
  }

  function buildFrontendSearchUrl(query) {
    const params = new URLSearchParams({
      q: query,
      search_field: "all_fields",
    });

    return `${FRONTEND_BASE}/search?${params.toString()}`;
  }

  function showChartMessage(message) {
    els.chartMessage.hidden = false;
    els.chartMessage.textContent = message;
  }

  function clearChartMessage() {
    els.chartMessage.hidden = true;
    els.chartMessage.textContent = "";
  }

  function setStatus(label, state) {
    els.apiStatus.textContent = label;
    els.apiStatus.classList.toggle("is-loading", state === "loading");
    els.apiStatus.classList.toggle("is-error", state === "error");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(Number(value) || 0);
  }

  function formatCompact(value) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(value) || 0);
  }

  function firstValue(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }

    return value || "";
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  init();
})();
