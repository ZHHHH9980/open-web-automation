"use strict";

const { findConfiguredApiResponse, getValueByPath } = require("./helpers");
const { normalizeListItem, isUsefulDisplayItem } = require("./list-normalizers");

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
  async execute(_page, action, state) {
    const matched = findConfiguredApiResponse(state, "list");
    if (!matched.ok) {
      throw new Error(`scrape_list: ${matched.error}`);
    }

    const maxItems = Number.isFinite(Number(action.max_items)) ? Number(action.max_items) : 50;
    const itemsPath = matched.apiConfig?.items_path || "data.items";
    const allItems = Array.isArray(getValueByPath(matched.response.data, itemsPath))
      ? getValueByPath(matched.response.data, itemsPath)
      : [];

    if (allItems.length === 0) {
      throw new Error(`scrape_list: configured endpoint returned no items at path '${itemsPath}' (${matched.endpoint})`);
    }

    const normalizedEntries = allItems
      .map((item) => ({ raw: item, display: normalizeListItem(state, item) }))
      .filter((entry) => isUsefulDisplayItem(entry.display))
      .slice(0, maxItems);

    if (normalizedEntries.length === 0) {
      throw new Error(`scrape_list: no usable structured items were derived from '${itemsPath}' (${matched.endpoint})`);
    }

    const items = normalizedEntries.map((entry) => entry.raw);
    const displayItems = normalizedEntries.map((entry) => entry.display);

    return {
      done: false,
      data: {
        endpoint: matched.endpoint,
        items_path: itemsPath,
        items,
        display_items: displayItems,
        count: displayItems.length,
        source: "api",
      },
      note: `scrape_list: extracted ${displayItems.length} items from ${matched.endpoint}`,
    };
  },
};
