"use strict";

module.exports = {
  name: "listen",
  category: "Data",
  summary: "Start capturing JSON API responses.",
  parameters: [],
  examples: [
    { action: "listen", reason: "Start API monitoring before navigation" },
  ],
  rules: [
    "Use before goto when data is likely loaded via XHR or fetch.",
  ],
  canExecute() {
    return true;
  },
  async execute(page, _action, _state, context = {}) {
    if (!context.startApiCollection) {
      throw new Error("listen action requires startApiCollection function in context");
    }

    const apiCollector = context.startApiCollection(page);
    if (!context.apiCollectors) {
      context.apiCollectors = [];
    }
    context.apiCollectors.push(apiCollector);

    return {
      done: false,
      note: "listen started (API monitoring active)",
      apiCollector,
    };
  },
};
