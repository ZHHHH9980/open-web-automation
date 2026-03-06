"use strict";

module.exports = {
  name: "fail",
  category: "Control",
  summary: "Finish unsuccessfully when the task cannot be completed.",
  parameters: [
    "result (optional): failure summary.",
    "data (optional): structured payload.",
  ],
  examples: [
    { action: "fail", result: "Required content is unavailable", reason: "The site has no matching result" },
  ],
  rules: [
    "Prefer fail over done when the goal is clearly unreachable.",
  ],
  canExecute() {
    return true;
  },
  async execute(_page, action) {
    return {
      done: true,
      success: false,
      result: action.result || action.reason || "planner marked as failed",
      data: action.data || {},
      note: "fail",
    };
  },
};
