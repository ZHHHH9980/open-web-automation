"use strict";

const { findConfiguredApiResponse, getValueByPath } = require("./helpers");

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
  async execute(_page, action, state) {
    const matched = findConfiguredApiResponse(state, "list");
    if (!matched.ok) {
      throw new Error(`scrape_list: ${matched.error}`);
    }

    const maxItems = Number.isFinite(Number(action.max_items)) ? Number(action.max_items) : 50;
    const itemsPath = matched.apiConfig?.items_path || "data.items";
    const items = Array.isArray(getValueByPath(matched.response.data, itemsPath))
      ? getValueByPath(matched.response.data, itemsPath).slice(0, maxItems)
      : [];

    if (items.length === 0) {
      throw new Error(`scrape_list: configured endpoint returned no items at path '${itemsPath}' (${matched.endpoint})`);
    }

    return {
      done: false,
      data: {
        endpoint: matched.endpoint,
        items_path: itemsPath,
        items,
        count: items.length,
        source: "api",
      },
      note: `scrape_list: extracted ${items.length} items from ${matched.endpoint}`,
    };
  },
};
