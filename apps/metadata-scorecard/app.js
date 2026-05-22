(function () {
  const API_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu/api/v1";
  const FRONTEND_BASE = "https://lib-geoportal-prd-web-01.oit.umn.edu";
  const SCORING_MATRIX_URL = "scoring-matrix.csv";
  const TOKEN_WAIT_MESSAGE = "We're out of API tokens. Please wait a minute before continuing.";

  const els = {
    form: document.querySelector("#resourceForm"),
    resourceId: document.querySelector("#resourceId"),
    presets: Array.from(document.querySelectorAll(".preset")),
    recordTitle: document.querySelector("#recordTitle"),
    summaryText: document.querySelector("#summaryText"),
    scoreHeading: document.querySelector("#scoreHeading"),
    scoreBadge: document.querySelector("#scoreBadge"),
    scoreMeterFill: document.querySelector("#scoreMeterFill"),
    scorePercent: document.querySelector("#scorePercent"),
    pointsEarned: document.querySelector("#pointsEarned"),
    pointsPossible: document.querySelector("#pointsPossible"),
    fieldsPresent: document.querySelector("#fieldsPresent"),
    fieldsPossible: document.querySelector("#fieldsPossible"),
    requiredMissing: document.querySelector("#requiredMissing"),
    scoreList: document.querySelector("#scoreList"),
    groupList: document.querySelector("#groupList"),
    emptyState: document.querySelector("#emptyState"),
    recordCard: document.querySelector("#recordCard"),
    metadataTitle: document.querySelector("#metadataTitle"),
    metadataDescription: document.querySelector("#metadataDescription"),
    metadataId: document.querySelector("#metadataId"),
    metadataProvider: document.querySelector("#metadataProvider"),
    recordLink: document.querySelector("#recordLink"),
    apiLink: document.querySelector("#apiLink"),
  };

  let abortController = null;
  let scoringMatrix = [];

  async function init() {
    els.form.addEventListener("submit", handleSubmit);
    els.presets.forEach((button) => button.addEventListener("click", handlePreset));

    renderScorePlaceholder();
    renderIcons();

    try {
      scoringMatrix = await fetchScoringMatrix();
      renderScorePlaceholder();
      loadRecord();
    } catch (error) {
      console.error(error);
      setStatus("Matrix error", "error");
      showEmpty("The scoring matrix could not be loaded.", "Matrix error");
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    markPresetActive();
    loadRecord();
  }

  function handlePreset(event) {
    const button = event.currentTarget;
    els.resourceId.value = button.dataset.resourceId || "";
    markPresetActive(button);
    loadRecord();
  }

  function markPresetActive(activeButton) {
    els.presets.forEach((button) => button.classList.toggle("active", button === activeButton));
  }

  async function loadRecord() {
    const id = els.resourceId.value.trim();

    if (!scoringMatrix.length) {
      setStatus("Loading matrix", "loading");
      return;
    }

    if (!id) {
      setStatus("Enter an ID", "error");
      showEmpty("Enter a resource ID.", "Ready");
      renderScorePlaceholder();
      return;
    }

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    setStatus("Querying BTAA", "loading");
    showEmpty("Loading metadata.", "Loading");

    try {
      const payload = await fetchRecord(id, abortController.signal);
      const record = payload.data || {};
      const ogm = record.attributes?.ogm || {};

      const score = scoreMetadata(ogm);
      renderRecord(record, ogm, score);
      renderScore(score);
      setStatus("", null);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      if (isApiTokenExhaustion(error)) {
        setStatus("API tokens exhausted", "error");
        showEmpty(TOKEN_WAIT_MESSAGE, "API tokens exhausted");
        renderScorePlaceholder();
        return;
      }

      if (error.status === 404) {
        setStatus("Not found", "error");
        showEmpty("No resource found for that ID.", "Not found");
        renderScorePlaceholder();
        return;
      }

      console.error(error);
      setStatus("API error", "error");
      showEmpty(error.message || "The BTAA API did not return a record.", "API error");
      renderScorePlaceholder();
    }
  }

  async function fetchScoringMatrix() {
    const response = await fetch(SCORING_MATRIX_URL, {
      headers: { Accept: "text/csv, text/plain" },
    });

    if (!response.ok) {
      throw new Error(`Scoring matrix returned ${response.status}`);
    }

    const rows = parseCsv(await response.text());
    const [headers, ...dataRows] = rows;
    const normalizedHeaders = headers.map((header) => header.trim());

    return dataRows
      .map((row) => rowToMatrixItem(normalizedHeaders, row))
      .filter((item) => item.fieldName && item.importance > 0);
  }

  function rowToMatrixItem(headers, row) {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] || "";
    });

    return {
      label: item["Field Label"] || item["Field Name"],
      fieldName: item["Field Name"],
      group: item.Group || "Other",
      required: /^true$/i.test(item["Required?"] || ""),
      importance: Number.parseInt(item.Importance || "0", 10) || 0,
      purpose: item.Purpose || "",
      controlledVocabulary: /^true$/i.test(item["Controlled Vocabulary?"] || ""),
      vocabularyList: item["Vocabulary List"] || "",
      fieldType: item["Field Type"] || "",
      definitionUri: item["Definition URI"] || "",
    };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const nextChar = text[index + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(value);
        value = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") {
          index += 1;
        }
        row.push(value);
        if (row.some((cell) => cell.trim() !== "")) {
          rows.push(row);
        }
        row = [];
        value = "";
      } else {
        value += char;
      }
    }

    row.push(value);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }

    return rows;
  }

  async function fetchRecord(id, signal) {
    const response = await fetch(buildRecordUrl(id), {
      headers: { Accept: "application/vnd.api+json, application/json" },
      signal,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response.json();
  }

  function buildRecordUrl(id) {
    return `${API_BASE}/resources/${encodeURIComponent(id)}`;
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

  function scoreMetadata(ogm) {
    const fieldResults = scoringMatrix.map((item) => {
      const value = ogm[item.fieldName];
      const present = isPresent(value);

      return {
        ...item,
        present,
        value,
        earned: present ? item.importance : 0,
      };
    });
    const totalPoints = fieldResults.reduce((sum, item) => sum + item.importance, 0);
    const earnedPoints = fieldResults.reduce((sum, item) => sum + item.earned, 0);
    const presentCount = fieldResults.filter((item) => item.present).length;
    const requiredMissing = fieldResults.filter((item) => item.required && !item.present);
    const percent = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const failedRequired = requiredMissing.length > 0;
    const grade = failedRequired ? "F" : getGrade(percent);

    return {
      fieldResults,
      groups: scoreGroups(fieldResults),
      totalPoints,
      earnedPoints,
      presentCount,
      totalFields: fieldResults.length,
      requiredMissing,
      percent,
      grade,
      failedRequired,
      label: getQualityLabel(grade, failedRequired),
    };
  }

  function scoreGroups(fieldResults) {
    const groups = new Map();

    fieldResults.forEach((item) => {
      if (!groups.has(item.group)) {
        groups.set(item.group, {
          name: item.group,
          earned: 0,
          possible: 0,
          present: 0,
          total: 0,
        });
      }

      const group = groups.get(item.group);
      group.earned += item.earned;
      group.possible += item.importance;
      group.present += item.present ? 1 : 0;
      group.total += 1;
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      percent: group.possible ? Math.round((group.earned / group.possible) * 100) : 0,
    }));
  }

  function getGrade(percent) {
    if (percent >= 90) {
      return "A";
    }

    if (percent >= 80) {
      return "B";
    }

    if (percent >= 70) {
      return "C";
    }

    if (percent >= 60) {
      return "D";
    }

    return "F";
  }

  function getQualityLabel(grade, failedRequired) {
    if (failedRequired) {
      return "Required field missing";
    }

    if (grade === "A") {
      return "Excellent metadata";
    }

    if (grade === "B") {
      return "Strong metadata";
    }

    if (grade === "C") {
      return "Solid metadata";
    }

    if (grade === "D") {
      return "Needs attention";
    }

    return "High-priority cleanup";
  }

  function renderRecord(record, ogm, score) {
    const id = record.id || ogm.id || els.resourceId.value.trim();
    const title = ogm.dct_title_s || "Untitled resource";
    const description = toText(ogm.dct_description_sm) || "No description available.";
    const apiUrl = buildRecordUrl(id);

    els.emptyState.hidden = true;
    els.recordCard.hidden = false;
    els.recordTitle.textContent = title;
    els.summaryText.textContent = `${score.label}: ${score.earnedPoints} of ${score.totalPoints} weighted points from ${scoringMatrix.length} matrix fields.`;
    els.metadataTitle.textContent = title;
    els.metadataDescription.textContent = description;
    els.metadataId.textContent = id;
    els.metadataProvider.textContent = ogm.schema_provider_s || toText(ogm.dct_publisher_sm) || "Unknown";
    els.recordLink.href = `${FRONTEND_BASE}/resources/${encodeURIComponent(id)}`;
    els.apiLink.href = apiUrl;
  }

  function renderScore(score) {
    els.scoreHeading.textContent = `Grade ${score.grade}`;
    els.scoreBadge.textContent = score.label;
    els.scorePercent.textContent = `${score.percent}%`;
    els.scoreMeterFill.style.width = `${score.percent}%`;
    els.pointsEarned.textContent = score.earnedPoints.toLocaleString();
    els.pointsPossible.textContent = score.totalPoints.toLocaleString();
    els.fieldsPresent.textContent = score.presentCount.toLocaleString();
    els.fieldsPossible.textContent = score.totalFields.toLocaleString();
    els.requiredMissing.textContent = score.requiredMissing.length.toLocaleString();

    els.scoreBadge.className = `score-badge score-badge-${score.grade.toLowerCase()}`;
    els.scoreMeterFill.className = `score-meter-fill score-meter-${score.grade.toLowerCase()}`;
    els.scoreList.replaceChildren(...score.fieldResults
      .slice()
      .sort(compareFieldResults)
      .map(renderScoreItem));
    els.groupList.replaceChildren(...score.groups.map(renderGroupItem));
    renderIcons();
  }

  function compareFieldResults(left, right) {
    if (left.required !== right.required) {
      return left.required ? -1 : 1;
    }

    if (left.present !== right.present) {
      return left.present ? 1 : -1;
    }

    return right.importance - left.importance || left.label.localeCompare(right.label);
  }

  function renderScorePlaceholder() {
    const fieldCount = scoringMatrix.length || 0;
    const totalPoints = scoringMatrix.reduce((sum, item) => sum + item.importance, 0);

    els.scoreHeading.textContent = "No score yet";
    els.scoreBadge.textContent = fieldCount ? "Ready to score" : "Loading matrix";
    els.scoreBadge.className = "score-badge score-badge-waiting";
    els.scorePercent.textContent = "0%";
    els.scoreMeterFill.style.width = "0%";
    els.scoreMeterFill.className = "score-meter-fill";
    els.pointsEarned.textContent = "0";
    els.pointsPossible.textContent = totalPoints.toLocaleString();
    els.fieldsPresent.textContent = "0";
    els.fieldsPossible.textContent = fieldCount.toLocaleString();
    els.requiredMissing.textContent = "0";
    els.scoreList.replaceChildren(...scoringMatrix.slice(0, 8).map((item) => renderScoreItem({
      ...item,
      present: false,
      earned: 0,
      value: null,
    })));
    els.groupList.replaceChildren();
    renderIcons();
  }

  function renderScoreItem(result) {
    const row = document.createElement("div");
    row.className = result.present ? "score-item score-item-present" : "score-item score-item-missing";
    if (result.required) {
      row.classList.add("score-item-required");
    }

    const icon = document.createElement("span");
    icon.className = "score-icon";
    icon.innerHTML = result.present
      ? '<i data-lucide="check" aria-hidden="true"></i>'
      : '<i data-lucide="x" aria-hidden="true"></i>';

    const body = document.createElement("div");
    body.className = "score-item-body";

    const header = document.createElement("div");
    header.className = "score-item-header";

    const label = document.createElement("strong");
    label.textContent = result.label;

    const points = document.createElement("span");
    points.textContent = `${result.earned}/${result.importance}`;

    const meta = document.createElement("span");
    meta.className = "score-item-meta";
    meta.textContent = `${result.fieldName} - ${result.group}${result.required ? " - required" : ""}`;

    const value = document.createElement("span");
    value.className = "score-item-value";
    value.textContent = result.present ? truncate(toText(result.value), 120) : result.purpose || "Missing";

    header.append(label, points);
    body.append(header, meta, value);
    row.append(icon, body);

    return row;
  }

  function renderGroupItem(group) {
    const row = document.createElement("div");
    row.className = "group-item";

    const heading = document.createElement("div");
    heading.className = "group-heading";

    const name = document.createElement("strong");
    name.textContent = group.name;

    const score = document.createElement("span");
    score.textContent = `${group.percent}%`;

    const meter = document.createElement("div");
    meter.className = "group-meter";

    const fill = document.createElement("span");
    fill.style.width = `${group.percent}%`;

    const detail = document.createElement("p");
    detail.textContent = `${group.earned}/${group.possible} points, ${group.present}/${group.total} fields`;

    heading.append(name, score);
    meter.append(fill);
    row.append(heading, meter, detail);

    return row;
  }

  function isPresent(value) {
    if (value === null || value === undefined) {
      return false;
    }

    if (Array.isArray(value)) {
      return value.some(isPresent);
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }

    return true;
  }

  function showEmpty(message, title) {
    els.emptyState.hidden = false;
    els.emptyState.querySelector("p").textContent = message;
    els.recordCard.hidden = true;
    els.recordTitle.textContent = title;
    els.summaryText.textContent = message;
  }

  function setStatus(message, type) {
    document.body.dataset.status = type || "";
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.map(toText).filter(Boolean).join(", ");
    }

    if (value && typeof value === "object") {
      return JSON.stringify(value);
    }

    return value === null || value === undefined ? "" : String(value);
  }

  function truncate(value, length) {
    if (value.length <= length) {
      return value;
    }

    return `${value.slice(0, length - 1)}...`;
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  init();
})();
