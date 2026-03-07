"use strict";

module.exports = {
  name: "back",
  category: "Navigation",
  summary: "Go back in browser history.",
  parameters: [],
  examples: [
    { action: "back", reason: "Return to the previous page" },
  ],
  rules: [],
  canExecute() {
    return true;
  },
  async execute(page) {
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
    return { done: false, note: "back" };
  },
};
