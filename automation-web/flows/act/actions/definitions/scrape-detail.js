"use strict";

const { findConfiguredApiResponse, getValueByPath } = require("./helpers");

module.exports = {
  name: "scrape_detail",
  category: "Data",
  summary: "Extract detail data from the configured site API endpoint.",
  parameters: [],
  examples: [
    { action: "scrape_detail", reason: "Extract detail from the configured detail API" },
  ],
  rules: [
    "Requires prior listen and a site-configured api.detail endpoint.",
    "Do not use on sites without api.detail in site-config.",
  ],
  canExecute(_action, state) {
    return findConfiguredApiResponse(state, "detail").ok;
  },
  explainCanExecute(_action, state) {
    const matched = findConfiguredApiResponse(state, "detail");
    return matched.ok ? "" : matched.error;
  },
  async execute(_page, _action, state, context = {}) {
    const matched = findConfiguredApiResponse(state, "detail", {
      minTimestamp: context.lastNavigationTriggerAt || 0,
    });
    if (!matched.ok) {
      throw new Error(`scrape_detail: ${matched.error}`);
    }

    const detailPath = matched.apiConfig?.detail_path || "data";
    const detail = getValueByPath(matched.response.data, detailPath);
    if (!detail || Array.isArray(detail)) {
      throw new Error(`scrape_detail: configured endpoint returned invalid detail payload at path '${detailPath}' (${matched.endpoint})`);
    }

    return {
      done: false,
      data: {
        endpoint: matched.endpoint,
        detail_path: detailPath,
        detail,
        source: "api",
      },
      note: `scrape_detail: extracted detail data from ${matched.endpoint}`,
    };
  },
};
