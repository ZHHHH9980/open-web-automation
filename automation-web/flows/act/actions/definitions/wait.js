"use strict";

const { toInt } = require("./helpers");

module.exports = {
  name: "wait",
  category: "Interaction",
  summary: "Pause briefly for page updates.",
  parameters: [
    "wait_ms (optional): between 200 and 20000 ms.",
  ],
  examples: [
    { action: "wait", wait_ms: 1500, reason: "Allow dynamic content to settle" },
  ],
  rules: [
    "Use sparingly; prefer explicit actions when possible.",
  ],
  canExecute() {
    return true;
  },
  async execute(page, action) {
    const ms = Number.isFinite(Number(action.wait_ms)) ? toInt(action.wait_ms, 1200) : 1200;
    await page.waitForTimeout(Math.max(200, Math.min(ms, 20000)));
    return { done: false, note: `wait ${ms}` };
  },
};
