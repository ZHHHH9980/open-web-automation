"use strict";

const { toResult, looksLikeHumanIntervention } = require("../core/result");
const { safeClickByText, grabBodyText, makeScreenshot, compactList } = require("../core/browser");

async function runGoogleSearch(page, cmd) {
  const query = cmd.query || "";
  if (!query) {
    return toResult({
      success: false,
      exit_code: 1,
      message: "Google 搜索缺少 query。",
      meta: { cmd },
    });
  }

  await page.goto("https://www.google.com/ncr", { waitUntil: "domcontentloaded" });
  await safeClickByText(page, ["I agree", "Accept all", "同意", "接受全部"]);

  let submitted = false;
  try {
    const input = page.locator('textarea[name="q"]').first();
    await input.waitFor({ timeout: 4000 });
    await input.fill(query);
    await page.keyboard.press("Enter");
    submitted = true;
  } catch (_err) {
    // fallback below
  }

  if (!submitted) {
    const q = encodeURIComponent(query);
    await page.goto(`https://www.google.com/search?q=${q}&hl=zh-CN`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(1800);
  const bodyText = await grabBodyText(page, 8000);
  const needHuman = looksLikeHumanIntervention(bodyText, page.url());
  const shot = await makeScreenshot(page, "google-search");

  const results = await page.evaluate(() => {
    const links = [];
    const seen = new Set();
    const h3List = Array.from(document.querySelectorAll("a h3"));
    for (const h3 of h3List) {
      const a = h3.closest("a");
      if (!a) continue;
      const title = (h3.textContent || "").trim();
      const url = (a.href || "").trim();
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);
      links.push({ title, url });
      if (links.length >= 12) break;
    }
    return links;
  });

  const top = compactList(results, cmd.limit || 10);
  const lines = top.length
    ? top.map((r, idx) => `${idx + 1}. ${r.title} (${r.url})`).join("\n")
    : "未提取到搜索结果。";

  return toResult({
    success: !needHuman,
    exit_code: needHuman ? 2 : 0,
    screenshot: shot.base64,
    message: needHuman
      ? `Google 页面触发验证或登录，请人工接管后重试。\n当前关键词：${query}`
      : `Google 搜索完成，关键词：${query}\n${lines}`,
    meta: {
      site: "google",
      action: "search",
      query,
      results: top,
      requires_human: needHuman,
      screenshot_path: shot.filePath,
      page_excerpt: bodyText.slice(0, 1200),
    },
  });
}

module.exports = {
  runGoogleSearch,
};
