"use strict";

const { buildSearchUrl } = require("../../act/site-config");

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripQuotedText(value) {
  return normalizeWhitespace(String(value || "").replace(/[“”"'‘’《》【】]/g, " "));
}

function stripTaskLead(value) {
  return normalizeWhitespace(
    String(value || "")
      .replace(/^帮我(?:去)?/, "")
      .replace(/^请(?:你)?(?:帮我)?/, "")
      .replace(/^麻烦(?:你)?(?:帮我)?/, "")
      .replace(/^去/, "")
      .replace(/^到/, "")
      .replace(/^在/, "")
  );
}

function extractRequestedCount(task) {
  const normalizedTask = stripQuotedText(task);
  const match = normalizedTask.match(/(?:返回|给我|看|看看)?\s*(\d+)\s*篇/);
  return match ? Math.max(1, Number(match[1]) || 1) : 1;
}

function mergeSubtypes(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

const AUTHOR_SELECTION_POOL_SIZE = 50;

function extractZhihuAuthorIntent(task, analysis) {
  const targetSite = String(analysis?.target_site || "").trim();
  if (targetSite !== "zhihu.com") {
    return null;
  }

  const normalizedTask = stripQuotedText(stripTaskLead(task));
  const maxItems = extractRequestedCount(task);
  const patterns = [
    /(?:去|到|在)?知乎(?:上)?(?:看看|看下|搜搜|搜索|找找|浏览一下|浏览下|瞅瞅)?\s*([^，。！？?]+?)\s*的\s*最新(?:的)?(?:一篇|1篇)?(?:文章|回答|帖子|想法|内容)/,
    /(?:去|到|在)?知乎(?:上)?(?:看看|看下|搜搜|搜索|找找|浏览一下|浏览下|瞅瞅)?\s*([^，。！？?]+?)\s*最近(?:的)?(?:文章|回答|帖子|想法|内容)/,
  ];

  for (const pattern of patterns) {
    const match = normalizedTask.match(pattern);
    if (match && match[1]) {
      const author = normalizeWhitespace(match[1].replace(/^(用户|作者|博主)\s*/, ""));
      if (author) {
        return { author, latestOnly: true, maxItems };
      }
    }
  }

  const goal = normalizeWhitespace(analysis?.goal || "");
  if (goal && /最新|最近/.test(goal) && /文章|回答|帖子|想法|内容/.test(goal)) {
    const keywords = Array.isArray(analysis?.keywords) ? analysis.keywords : [];
    const filtered = keywords
      .map((item) => normalizeWhitespace(item))
      .filter(Boolean)
      .filter((item) => !/^(最新|最近|最新文章|文章|回答|帖子|想法|内容)$/.test(item));
    if (filtered.length === 1) {
      return { author: filtered[0], latestOnly: true, maxItems };
    }
  }

  return null;
}

function buildZhihuAuthorLatestPlan(intent) {
  return [
    {
      step: 1,
      action: "listen",
      reason: "先开启 API 监听，后续既要抓搜索结果，也要抓作者主页文章接口",
    },
    {
      step: 2,
      action: "goto",
      url: buildSearchUrl("zhihu.com", [intent.author]) || `https://www.zhihu.com/search?q=${encodeURIComponent(intent.author)}`,
      reason: `先搜索作者“${intent.author}”，定位到该作者名下的内容结果`,
    },
    {
      step: 3,
      action: "scrape_list",
      max_items: 1,
      author: intent.author,
      exact_author: true,
      latest_only: true,
      capture: false,
      reason: `从搜索结果中精确筛出作者“${intent.author}”的内容，并拿到作者主页线索`,
    },
    {
      step: 4,
      action: "goto",
      url: "{{item_1_author_posts_url}}",
      reason: `进入作者“${intent.author}”的文章页，触发 members/{url_token}/articles 接口`,
    },
    {
      step: 5,
      action: "scrape_list",
      max_items: Math.max(AUTHOR_SELECTION_POOL_SIZE, intent.maxItems || 1),
      latest_only: true,
      capture: false,
      reason: "先抓取作者文章列表候选，并按发布时间排序供后续选择",
    },
    {
      step: 6,
      action: "select_list",
      selection_query: intent.selectionQuery,
      reason: "根据用户原始请求，从作者文章列表中选择目标内容",
    },
    {
      step: 7,
      action: "done",
      result: `已获取作者“${intent.author}”的知乎文章并完成选择`,
      reason: "作者主页文章列表已抓取并完成目标选择",
    },
  ];
}

function apply(task, analysis, plan) {
  const intent = extractZhihuAuthorIntent(task, analysis);
  if (!intent) {
    return { analysis, plan, applied: false };
  }

  const subtypes = mergeSubtypes([...(analysis?.subtypes || []), "entity_lookup", "latest_content_fetch", "content_understanding"]);

  return {
    applied: true,
    analysis: {
      ...(analysis || {}),
      keywords: [intent.author],
      goal: `在知乎定位作者“${intent.author}”，进入其文章页并从文章列表中选择符合请求的内容`,
      subtypes,
      task_types: subtypes,
      primary_subtype: "latest_content_fetch",
    },
    plan: buildZhihuAuthorLatestPlan({ ...intent, selectionQuery: normalizeWhitespace(task) }),
  };
}

module.exports = {
  name: "zhihu-author-latest",
  apply,
  __internal: {
    normalizeWhitespace,
    stripQuotedText,
    stripTaskLead,
    extractRequestedCount,
    extractZhihuAuthorIntent,
    buildZhihuAuthorLatestPlan,
    mergeSubtypes,
  },
};
