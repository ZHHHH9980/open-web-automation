"use strict";

module.exports = {
  name: "done",
  category: "Control",
  summary: "Finish successfully and return a result summary.",
  parameters: [
    "result (optional): human-readable completion summary.",
    "data (optional): structured payload.",
  ],
  examples: [
    { action: "done", result: "Collected the requested articles", reason: "Task is fully complete" },
  ],
  rules: [
    "Only use once all requested items have been collected.",
  ],
  canExecute() {
    return true;
  },
  async execute(_page, action) {
    return {
      done: true,
      success: true,
      result: action.result || "task completed",
      data: action.data || {},
      note: "done",
    };
  },
};
