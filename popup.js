const URL_MAPPINGS_KEY = "urlMappings";
const URL_MAPPINGS_STORAGE_AREA = "sync";
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

const form = document.getElementById("mapping-form");
const sourceInput = document.getElementById("source-input");
const targetInput = document.getElementById("target-input");
const status = document.getElementById("status");
const mappingsList = document.getElementById("mappings-list");
const HTTP_PREFIX = "http://";

function normalizeUrl(rawValue, { allowBareHost = false } = {}) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmedValue = rawValue.trim();

  if (!trimmedValue) {
    return null;
  }

  const candidate = allowBareHost && !trimmedValue.includes("://")
    ? `http://${trimmedValue}`
    : trimmedValue;

  try {
    const parsedUrl = new URL(candidate);

    if (!HTTP_PROTOCOLS.has(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.href;
  } catch (error) {
    return null;
  }
}

function normalizeStoredMapping(mapping) {
  const source = normalizeUrl(mapping?.source, { allowBareHost: true });
  const target = normalizeUrl(mapping?.target);

  if (!source || !target || source === target) {
    return null;
  }

  return { source, target };
}

function normalizeShortcutSource(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmedValue = rawValue.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedValue) && !/^http:\/\//i.test(trimmedValue)) {
    return null;
  }

  const shortcutValue = trimmedValue.replace(/^http:\/\//i, "");
  return normalizeUrl(shortcutValue, { allowBareHost: true });
}

function formatShortcutSource(sourceUrl) {
  try {
    const parsedUrl = new URL(sourceUrl);

    if (parsedUrl.protocol !== "http:") {
      return sourceUrl;
    }

    const suffix = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    return suffix === "/" ? parsedUrl.host : `${parsedUrl.host}${suffix}`;
  } catch (error) {
    return sourceUrl.startsWith(HTTP_PREFIX)
      ? sourceUrl.slice(HTTP_PREFIX.length)
      : sourceUrl;
  }
}

async function getStoredMappings() {
  const stored = await chrome.storage[URL_MAPPINGS_STORAGE_AREA].get(URL_MAPPINGS_KEY);
  const mappings = stored[URL_MAPPINGS_KEY];

  if (!Array.isArray(mappings)) {
    return [];
  }

  return mappings
    .map((mapping) => normalizeStoredMapping(mapping))
    .filter(Boolean)
    .map((mapping) => ({
      ...mapping,
      shortcutLabel: formatShortcutSource(mapping.source),
    }))
    .sort((left, right) => left.shortcutLabel.localeCompare(right.shortcutLabel));
}

async function saveMappings(mappings) {
  await chrome.storage[URL_MAPPINGS_STORAGE_AREA].set({
    [URL_MAPPINGS_KEY]: mappings,
  });
}

function setStatus(message, { isError = false } = {}) {
  status.textContent = message;
  status.classList.toggle("status--error", isError);
}

function createEmptyState() {
  const emptyState = document.createElement("li");
  emptyState.className = "empty-state";
  emptyState.textContent = "No mappings yet. Add one above to create a shortcut URL.";
  return emptyState;
}

function createMappingRow(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "mapping-item__text";

  const rowLabel = document.createElement("p");
  rowLabel.className = "mapping-item__label";
  rowLabel.textContent = label;

  const rowValue = document.createElement("p");
  rowValue.className = "mapping-item__value";
  rowValue.textContent = value;

  wrapper.append(rowLabel, rowValue);
  return wrapper;
}

function createMappingItem(mapping) {
  const item = document.createElement("li");
  item.className = "mapping-item";

  const topRow = document.createElement("div");
  topRow.className = "mapping-item__row";
  topRow.append(
    createMappingRow("Shortcut", mapping.shortcutLabel),
    createDeleteButton(mapping.source)
  );

  const bottomRow = document.createElement("div");
  bottomRow.className = "mapping-item__row";
  bottomRow.append(createMappingRow("Redirect", mapping.target));

  item.append(topRow, bottomRow);
  return item;
}

function createDeleteButton(source) {
  const button = document.createElement("button");
  button.className = "button button--danger";
  button.type = "button";
  button.dataset.source = source;
  button.textContent = "Delete";
  return button;
}

async function renderMappings() {
  const mappings = await getStoredMappings();
  mappingsList.replaceChildren();

  if (mappings.length === 0) {
    mappingsList.append(createEmptyState());
    return;
  }

  mappings.forEach((mapping) => {
    mappingsList.append(createMappingItem(mapping));
  });
}

async function upsertMapping(rawSource, rawTarget) {
  const source = normalizeShortcutSource(rawSource);
  const target = normalizeUrl(rawTarget);

  if (!source) {
    throw new Error("Enter a valid shortcut, such as c.");
  }

  if (!target) {
    throw new Error("Enter a valid redirect URL.");
  }

  if (source === target) {
    throw new Error("The shortcut URL and redirect URL need to be different.");
  }

  const mappings = await getStoredMappings();
  const nextMappings = [
    { source, target },
    ...mappings.filter((mapping) => mapping.source !== source),
  ];

  await saveMappings(nextMappings);
  return formatShortcutSource(source);
}

async function deleteMapping(source) {
  const mappings = await getStoredMappings();
  const nextMappings = mappings.filter((mapping) => mapping.source !== source);

  await saveMappings(nextMappings);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const shortcutLabel = await upsertMapping(sourceInput.value, targetInput.value);
    sourceInput.value = "";
    targetInput.value = "";
    setStatus(`Saved mapping for ${shortcutLabel}.`);
    await renderMappings();
    sourceInput.focus();
  } catch (error) {
    setStatus(error.message, { isError: true });
  }
});

mappingsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-source]");

  if (!button) {
    return;
  }

  const shortcutLabel = formatShortcutSource(button.dataset.source);
  await deleteMapping(button.dataset.source);
  setStatus(`Deleted mapping for ${shortcutLabel}.`);
  await renderMappings();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === URL_MAPPINGS_STORAGE_AREA && changes[URL_MAPPINGS_KEY]) {
    void renderMappings();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  void renderMappings();
  sourceInput.focus();
});
