"use strict";

const { findConfiguredApiResponse, getValueByPath, resolveConfiguredApi } = require("./helpers");
const { normalizeListItem, isUsefulDisplayItem } = require("./list-normalizers");

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
      if (!isUsefulDisplayItem(display)) continue;

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
  const isZhihuBrowseFeed = /zhihu\.com/i.test(String(page?.url?.() || state?.url || ""))
    && /\/api\/v3\/feed\/topstory\/recommend/i.test(endpoint);

  let apiResponses = getLiveApiResponses(state, context);
  let entries = buildStructuredEntries({ ...state, url: page?.url?.() || state?.url || "" }, endpoint, itemsPath, apiResponses, maxItems);

  if (entries.length >= maxItems || !isZhihuBrowseFeed) {
    return { entries, endpoint, itemsPath };
  }

  for (let attempt = 0; attempt < 3 && entries.length < maxItems; attempt += 1) {
    await page.mouse.wheel(0, 2600 + attempt * 400);
    await page.waitForTimeout(1800 + attempt * 400);
    apiResponses = getLiveApiResponses(state, context);
    entries = buildStructuredEntries({ ...state, url: page?.url?.() || state?.url || "" }, endpoint, itemsPath, apiResponses, maxItems);
  }

  return { entries, endpoint, itemsPath };
}

module.exports = {
  name: "scrape_list",
  category: "Data",
  summary: "Extract list data from the configured site API endpoint.",
  parameters: [
    "max_items (optional): limit returned items, default 50.",
  ],
  examples: [
    { action: "scrape_list", max_items: 10, reason: "Extract search results from the configured list API" },
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
    const { entries, endpoint, itemsPath } = await collectEnoughListEntries(page, state, context, maxItems);

    if (entries.length === 0) {
      throw new Error(`scrape_list: no usable structured items were derived from '${itemsPath}' (${endpoint})`);
    }

    const items = entries.map((entry) => entry.raw);
    const displayItems = entries.map((entry) => entry.display);

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
      note: `scrape_list: extracted ${displayItems.length} items from ${endpoint}`,
    };
  },
};
