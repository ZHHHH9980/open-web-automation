"use strict";

const { resolveSelector, hasCandidateTarget } = require("./helpers");

module.exports = {
  name: "close",
  category: "Control",
  summary: "Dismiss a modal, popup, or return via back navigation.",
  parameters: [
    "method='back' or use_back=true to go back.",
    "selector or target_id to click a specific close button.",
  ],
  examples: [
    { action: "close", reason: "Dismiss the popup with Escape" },
    { action: "close", method: "back", reason: "Return to the results list" },
  ],
  rules: [
    "Default strategy is Escape when no explicit close control is known.",
  ],
  canExecute(action, state) {
    if (action.method === "back" || action.use_back) return true;
    if (action.selector) return true;
    if (action.target_id) return hasCandidateTarget(action, state);
    return true;
  },
  async execute(page, action, state) {
    if (action.method === "back" || action.use_back) {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
      return { done: false, note: "close via back" };
    }

    if (action.selector || action.target_id) {
      const selector = resolveSelector(action, state);
      if (!selector) throw new Error("close requires valid selector or target_id");
      await page.locator(selector).first().click({ timeout: 5000 });
      return { done: false, note: `close ${selector}` };
    }

    await page.keyboard.press("Escape");
    return { done: false, note: "close via Escape" };
  },
};
