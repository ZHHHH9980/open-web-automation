"use strict";

const { getSiteConfig } = require("../../act/site-config");

function matches(url) {
  return /xiaohongshu\.com/i.test(String(url || ""));
}

function isSearchResult(state) {
  const url = String(state?.url || "");
  const siteConfig = getSiteConfig(url);
  const listEndpoint = siteConfig?.api?.list?.endpoint || siteConfig?.api?.list;
  return listEndpoint === "https://edith.xiaohongshu.com/api/sns/web/v1/search/notes"
    && /xiaohongshu\.com\/search_result\/?/i.test(url);
}

function canHandleClick(action, state) {
  return action?.target_id != null && isSearchResult(state);
}

function explainClickSupport(action, state) {
  if (action?.target_id == null) return "click requires target_id";
  if (!isSearchResult(state)) return `click is not supported on current page: ${state?.url || "unknown"}`;
  return "";
}

async function executeClick(page, action, state, context = {}) {
  const siteConfig = getSiteConfig(state?.url || "");
  const articleLinkSelector = siteConfig?.selectors?.article_link || ".note-item a[href]";

  if (!context.siteState) context.siteState = {};
  if (!context.siteState.xiaohongshu) {
    context.siteState.xiaohongshu = { visitedArticleKeys: [] };
  }

  const siteState = context.siteState.xiaohongshu;
  const targetRank = Math.max(1, Number(action.target_id) || 1);
  const visitedArticleKeys = Array.isArray(siteState.visitedArticleKeys) ? siteState.visitedArticleKeys : [];

  const pickedArticle = await page.evaluate(({ articleLinkSelector, targetRank, visitedArticleKeys }) => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width < 4 || rect.height < 4) return false;
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") < 0.05) return false;
      return true;
    }

    const anchors = Array.from(document.querySelectorAll(articleLinkSelector))
      .filter((anchor) => isVisible(anchor))
      .map((anchor) => ({
        href: anchor.href || anchor.getAttribute("href") || "",
        text: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim(),
        key: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim() || anchor.href || anchor.getAttribute("href") || "",
        anchor,
      }))
      .filter((item) => item.key && (!item.href || !item.href.startsWith("javascript:")));

    const uniqueAnchors = [];
    const seen = new Set();
    for (const item of anchors) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      uniqueAnchors.push(item);
    }

    const unvisited = uniqueAnchors.filter((item) => !visitedArticleKeys.includes(item.key));
    const picked = unvisited[targetRank - 1] || unvisited[0] || uniqueAnchors[targetRank - 1] || uniqueAnchors[0] || null;
    if (!picked) return null;

    picked.anchor.click();
    return { href: picked.href, text: picked.text, key: picked.key };
  }, { articleLinkSelector, targetRank, visitedArticleKeys });

  if (!pickedArticle) {
    throw new Error("no visible Xiaohongshu article link found on search results page");
  }

  if (!siteState.visitedArticleKeys.includes(pickedArticle.key)) {
    siteState.visitedArticleKeys.push(pickedArticle.key);
  }

  return {
    done: false,
    note: `click Xiaohongshu article title ${pickedArticle.text || pickedArticle.href || pickedArticle.key}`,
  };
}

module.exports = {
  name: "xiaohongshu",
  matches,
  canHandleClick,
  explainClickSupport,
  executeClick,
  __internal: {
    isSearchResult,
  },
};
