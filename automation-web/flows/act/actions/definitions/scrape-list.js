"use strict";

const { findConfiguredApiResponse, getValueByPath, resolveConfiguredApi } = require("./helpers");
const { normalizeListItem, isUsefulDisplayItem } = require("./list-normalizers");
const { collectListEntries: collectSiteListEntries } = require("../../site-adapters");

function buildStructuredEntries(state, endpoint, itemsPath, apiResponses, maxItems) {
  const matchedResponses = (apiResponses || []).filter((response) => String(response.url || "").startsWith(endpoint));
  const seen = new Set();
  const entries = [];

  for (const response of matchedResponses) {
    const rawItems = Array.isArray(getValueByPath(response.data, itemsPath))
      ? getValueByPath(response.data, itemsPath)
      : [];

    for (const rawItem of rawItems) {
      const display = normalizeListItem(state, rawItem);
      if (!isUsefulDisplayItem(state, display)) continue;

      const dedupeKey = [display.detail_url, display.title, display.author, display.content_summary]
        .map((part) => String(part || "").trim())
        .join("|");
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      entries.push({ raw: rawItem, display });
      if (entries.length >= maxItems) {
        return entries;
      }
    }
  }

  return entries;
}

function normalizeAuthorName(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function applyEntryFilters(entries, action = {}) {
  const allEntries = Array.isArray(entries) ? entries.slice() : [];
  const author = String(action.author || "").trim();
  const exactAuthor = Boolean(action.exact_author);
  const latestOnly = Boolean(action.latest_only);
  let filtered = allEntries;

  if (author) {
    const expected = normalizeAuthorName(author);
    filtered = filtered.filter((entry) => {
      const actual = normalizeAuthorName(entry?.display?.author || "");
      if (!actual) return false;
      return exactAuthor ? actual === expected : actual.includes(expected);
    });
  }

  if (latestOnly) {
    filtered = filtered
      .slice()
      .sort((left, right) => Number(right?.display?.publish_time || 0) - Number(left?.display?.publish_time || 0));
  }

  return filtered;
}

function getLiveApiResponses(state, context = {}) {
  const collectorData = context.currentApiCollector?.getData?.();
  if (Array.isArray(collectorData) && collectorData.length > 0) {
    return collectorData;
  }
  return state?.api_responses || [];
}

async function collectEnoughListEntries(page, state, context, maxItems) {
  const { apiConfig, endpoint } = resolveConfiguredApi({ ...state, url: page?.url?.() || state?.url || "" }, "list");
  const itemsPath = apiConfig?.items_path || "data.items";

  let apiResponses = getLiveApiResponses(state, context);
  let entries = buildStructuredEntries({ ...state, url: page?.url?.() || state?.url || "" }, endpoint, itemsPath, apiResponses, maxItems);

  if (entries.length >= maxItems) {
    return { entries, endpoint, itemsPath };
  }

  return { entries, endpoint, itemsPath };
}

module.exports = {
  name: "scrape_list",
  category: "Data",
  summary: "Extract list data from the configured site API endpoint.",
  parameters: [
    "max_items (optional): limit returned items, default 50.",
    "author (optional): keep only items from the matching author.",
    "exact_author (optional): require exact author match when author is set.",
    "latest_only (optional): sort matched items by publish time descending.",
  ],
  examples: [
    { action: "scrape_list", max_items: 10, reason: "Extract search results from the configured list API" },
    { action: "scrape_list", author: "数字生命卡兹克", exact_author: true, latest_only: true, max_items: 1, reason: "Find the latest post from one specific Zhihu author" },
  ],
  rules: [
    "Requires prior listen and a site-configured api.list endpoint.",
    "Do not use on sites without api.list in site-config.",
  ],
  canExecute(_action, state) {
    return findConfiguredApiResponse(state, "list").ok;
  },
  explainCanExecute(_action, state) {
    const matched = findConfiguredApiResponse(state, "list");
    return matched.ok ? "" : matched.error;
  },
  async execute(page, action, state, context = {}) {
    const matched = findConfiguredApiResponse(state, "list");
    if (!matched.ok) {
      throw new Error(`scrape_list: ${matched.error}`);
    }

    const maxItems = Number.isFinite(Number(action.max_items)) ? Number(action.max_items) : 50;
    const collectTarget = action.author ? Math.max(maxItems * 8, 50) : maxItems;
    const { entries, endpoint, itemsPath } = await collectSiteListEntries(page, state, context, action, {
      maxItems: collectTarget,
      defaultCollector: () => collectEnoughListEntries(page, state, context, collectTarget),
      buildStructuredEntries,
      getLiveApiResponses,
      resolveConfiguredApi,
    });

    let finalEntries = applyEntryFilters(entries, action);
    if (action.author && finalEntries.length === 0) {
      const authorLabel = String(action.author || "").trim();
      throw new Error(`scrape_list: no items matched author '${authorLabel}' from '${itemsPath}' (${endpoint})`);
    }

    if (finalEntries.length === 0) {
      throw new Error(`scrape_list: no usable structured items were derived from '${itemsPath}' (${endpoint})`);
    }

    finalEntries = finalEntries.slice(0, maxItems);
    const items = finalEntries.map((entry) => entry.raw);
    const displayItems = finalEntries.map((entry) => entry.display);
    const filterNote = action.author ? `, filtered author=${String(action.author).trim()}` : "";

    return {
      done: false,
      data: {
        endpoint,
        items_path: itemsPath,
        items,
        display_items: displayItems,
        count: displayItems.length,
        source: "api",
      },
      note: `scrape_list: extracted ${displayItems.length} items from ${endpoint}${filterNote}`,
    };
  },
  __internal: {
    buildStructuredEntries,
    applyEntryFilters,
    normalizeAuthorName,
    collectEnoughListEntries,
    getLiveApiResponses,
  },
};
