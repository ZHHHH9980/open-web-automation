"use strict";

const { resolveSelector, hasCandidateTarget } = require("./helpers");
const { canHandleClick, executePlatformClick } = require("../../platform-adapter");

module.exports = {
  name: "click",
  category: "Interaction",
  summary: "Click by coordinates, selector, or target_id.",
  parameters: [
    "Use one of: x+y, selector, or target_id.",
  ],
  examples: [
    { action: "click", target_id: 1, reason: "Open the first visible result" },
    { action: "click", x: 420, y: 180, reason: "Click the visible CTA" },
  ],
  rules: [
    "Prefer target_id when a candidate exists in state.",
  ],
  canExecute(action, state) {
    if (action.x != null && action.y != null) return true;
    if (action.selector) return true;
    if (canHandleClick(action, state)) return true;
    return hasCandidateTarget(action, state);
  },
  async execute(page, action, state, context = {}) {
    context.lastNavigationTriggerAt = Date.now();

    if (action.x != null && action.y != null) {
      await page.mouse.click(action.x, action.y);
      return { done: false, note: `click at (${action.x}, ${action.y})` };
    }

    if (!action.selector) {
      const platformResult = await executePlatformClick(page, action, state, context);
      if (platformResult) return platformResult;
    }

    const selector = resolveSelector(action, state);
    if (!selector) throw new Error("click requires selector, valid target_id, or coordinates (x, y)");
    await page.locator(selector).first().click({ timeout: 10000 });
    return { done: false, note: `click ${selector}` };
  },
};
