"use strict";

/**
 * Quick heuristic analysis without LLM
 * Used to determine initial URL before opening browser
 * LLM will do the real analysis after seeing the page
 */
function quickAnalyzeTask(task, commonSites = {}) {
  const taskLower = task.toLowerCase();

  // Detect intent
  const searchKeywords = ["搜索", "查找", "找", "search", "find"];
  const hasSearchIntent = searchKeywords.some(kw => taskLower.includes(kw));

  // Detect target site
  let targetSite = null;
  for (const [keyword, domain] of Object.entries(commonSites)) {
    if (taskLower.includes(keyword.toLowerCase())) {
      targetSite = domain;
      break;
    }
  }

  // Extract potential keywords
  const keywords = [];
  if (hasSearchIntent) {
    // Try to extract quoted content
    const quotedMatch = task.match(/["「『]([^"」』]+)["」』]/);
    if (quotedMatch) {
      keywords.push(quotedMatch[1]);
    } else {
      // Try to extract content after "搜索" keyword
      const searchMatch = task.match(/搜索[^\s]*\s+([^\s,，。]+)/);
      if (searchMatch) {
        keywords.push(searchMatch[1]);
      }
    }
  }

  return {
    intent: hasSearchIntent ? "search" : "browse",
    target_site: targetSite,
    keywords,
    goal: task
  };
}

module.exports = {
  quickAnalyzeTask
};
