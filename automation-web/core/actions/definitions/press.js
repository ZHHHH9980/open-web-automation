"use strict";

module.exports = {
  name: "press",
  category: "Interaction",
  summary: "Press a keyboard key.",
  parameters: [
    "key (optional): defaults to Enter.",
  ],
  examples: [
    { action: "press", key: "Enter", reason: "Submit the active search input" },
  ],
  rules: [],
  canExecute() {
    return true;
  },
  async execute(page, action) {
    const key = action.key || "Enter";
    await page.keyboard.press(key);
    return { done: false, note: `press ${key}` };
  },
};
