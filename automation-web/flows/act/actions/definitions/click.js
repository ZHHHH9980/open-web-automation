"use strict";

const { canHandleClick, executePlatformClick, explainClickSupport } = require("../../platform-adapter");

module.exports = {
  name: "click",
  category: "Interaction",
  summary: "Open a result item through platform-specific click handling.",
  parameters: [
    "target_id (required): 1-based result rank for sites that require click_result_item.",
  ],
  examples: [
    { action: "click", target_id: 1, reason: "Open the first visible result on a platform that requires click_result_item" },
  ],
  rules: [
    "Only use on sites with explicit platform click support.",
  ],
  canExecute(action, state) {
    return canHandleClick(action, state);
  },
  explainCanExecute(action, state) {
    return explainClickSupport(action, state);
  },
  async execute(page, action, state, context = {}) {
    context.lastNavigationTriggerAt = Date.now();

    const platformResult = await executePlatformClick(page, action, state, context);
    if (platformResult) return platformResult;

    throw new Error("click requires platform-specific support for the current site");
  },
};
