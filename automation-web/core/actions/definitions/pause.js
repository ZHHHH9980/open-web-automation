"use strict";

module.exports = {
  name: "pause",
  category: "Control",
  summary: "Pause and request human intervention.",
  parameters: [
    "result (optional): explain what the user needs to do.",
    "data (optional): structured payload.",
  ],
  examples: [
    { action: "pause", result: "Login required - paused for human intervention", reason: "A login wall blocks the content" },
  ],
  rules: [
    "Use for login walls, CAPTCHA, or risky actions needing explicit user help.",
  ],
  canExecute() {
    return true;
  },
  async execute(_page, action) {
    return {
      done: true,
      success: false,
      requiresHuman: true,
      result: action.result || action.reason || "paused for human intervention",
      data: action.data || {},
      note: "pause",
    };
  },
};
