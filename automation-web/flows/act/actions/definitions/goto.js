"use strict";

const { resolveCapturedItemUrl } = require("./helpers");

function isSemanticallySameUrl(currentUrl, targetUrl) {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);

    if (current.origin !== target.origin) return false;
    if (current.pathname.replace(/\/$/, "") !== target.pathname.replace(/\/$/, "")) return false;

    for (const [key, value] of target.searchParams.entries()) {
      if (current.searchParams.get(key) !== value) {
        return false;
      }
    }

    return true;
  } catch (_err) {
    return false;
  }
}

module.exports = {
  name: "goto",
  category: "Navigation",
  summary: "Navigate to a full URL.",
  parameters: [
    "url (required): full destination URL, including search params when useful.",
  ],
  examples: [
    { action: "goto", url: "https://www.xiaohongshu.com/search_result?keyword=openclaw", reason: "Open search results directly" },
  ],
  rules: [
    "Prefer direct URLs over form-filling for search flows.",
  ],
  canExecute(action) {
    return Boolean(action.url);
  },
  async execute(page, action, state, context = {}) {
    if (!action.url) throw new Error("goto requires url");
    const resolved = resolveCapturedItemUrl(action.url, context, state);
    if (!resolved.ok || !resolved.url) {
      throw new Error(`goto requires resolvable url: ${resolved.error || action.url}`);
    }

    const currentUrl = typeof page.url === "function" ? page.url() : state?.url || "";
    if (currentUrl && isSemanticallySameUrl(currentUrl, resolved.url)) {
      return { done: false, note: `goto skipped (already on ${resolved.url})` };
    }

    context.lastNavigationTriggerAt = Date.now();
    await page.goto(resolved.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    return { done: false, note: `goto ${resolved.url}` };
  },
};
