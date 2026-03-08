"use strict";

const TASK_SUBTYPES = [
  "browse_feed",
  "search_discovery",
  "entity_lookup",
  "latest_content_fetch",
  "content_understanding",
  "comparison_or_review",
];

const TASK_SUBTYPE_DESCRIPTIONS = {
  browse_feed: "随便看看、刷几篇、逛逛、看热榜/推荐流。",
  search_discovery: "按主题检索并返回候选结果，不要求锁定单一主体。",
  entity_lookup: "定位某个作者、账号、品牌、店铺或其他明确主体。",
  latest_content_fetch: "获取某个主体最近发布的一条内容。",
  content_understanding: "对具体内容做摘要、观点提取、要点提炼或解读。",
  comparison_or_review: "比较多个对象、做评测、审查或优劣判断。",
};

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  return unique(keywords.map((item) => normalizeWhitespace(item)).filter(Boolean));
}

function normalizeDeclaredSubtypes(analysis = {}) {
  const raw = [];

  if (Array.isArray(analysis.subtypes)) {
    raw.push(...analysis.subtypes);
  }

  if (Array.isArray(analysis.task_types)) {
    raw.push(...analysis.task_types);
  }

  if (analysis.primary_subtype) {
    raw.push(analysis.primary_subtype);
  }

  return unique(
    raw
      .map((item) => normalizeWhitespace(item))
      .filter((item) => TASK_SUBTYPES.includes(item))
  );
}

function buildAnalysisText(task, analysis = {}) {
  return normalizeWhitespace([
    task,
    analysis.goal,
    ...(Array.isArray(analysis.keywords) ? analysis.keywords : []),
  ].filter(Boolean).join(" "));
}

function hasBrowseCue(text) {
  return /(刷\s*\d+\s*篇|刷几篇|逛逛|随便看看|浏览一下|浏览下|看看热榜|看热榜|推荐流|首页|热点|热门)/.test(text);
}

function hasComparisonCue(text) {
  return /(对比|比较|评测|测评|review|审查|评审|哪个好|哪家好|优缺点|值不值得)/i.test(text);
}

function hasSummaryCue(text) {
  return /(总结|摘要|概括|讲了什么|说了什么|核心观点|关键要点|提炼|解读|分析|点评|review|评测|评价)/i.test(text);
}

function hasLatestCue(text) {
  return /(最新|最近|近期|刚发|最新一篇|最近一篇|最近的|最新的|刚发布|刚更新)/.test(text);
}

function hasSpecificContentCue(text) {
  return /(文章|回答|帖子|想法|内容|视频|作品|笔记|专栏|动态|帖子|博文)/.test(text);
}

function hasCandidateCue(text) {
  return /(前\s*\d+\s*(条|篇|个)|列出|推荐几|找几|返回前|候选|相关结果|结果列表|搜一下)/.test(text);
}

function hasEntityCue(text, analysis = {}) {
  if (/(作者|博主|up主|UP主|用户|账号|品牌|店铺|商家|店家|公众号|公司|店|主播)/.test(text)) {
    return true;
  }

  if (hasLatestCue(text) && hasSpecificContentCue(text) && /的/.test(text)) {
    return true;
  }

  const keywords = normalizeKeywords(analysis.keywords);
  if (keywords.length === 1 && keywords[0].length >= 2 && hasSpecificContentCue(text) && !hasCandidateCue(text)) {
    return true;
  }

  return false;
}

function inferTaskSubtypes(task, analysis = {}, plan = []) {
  const text = buildAnalysisText(task, analysis);
  const declared = normalizeDeclaredSubtypes(analysis);
  const inferred = [...declared];

  const browseCue = hasBrowseCue(text);
  const comparisonCue = hasComparisonCue(text);
  const summaryCue = hasSummaryCue(text);
  const latestCue = hasLatestCue(text) && hasSpecificContentCue(text);
  const entityCue = hasEntityCue(text, analysis);
  const candidateCue = hasCandidateCue(text);
  const hasDetailStep = Array.isArray(plan) && plan.some((step) => step?.action === "scrape_detail");
  const hasSingleResultFetch = Array.isArray(plan)
    && plan.some((step) => step?.action === "scrape_list" && Number(step?.max_items || 0) === 1);

  if (browseCue || analysis.intent === "browse") {
    inferred.push("browse_feed");
  }

  if (comparisonCue) {
    inferred.push("comparison_or_review");
  }

  if (entityCue) {
    inferred.push("entity_lookup");
  }

  if (latestCue) {
    inferred.push("latest_content_fetch");
  }

  if (summaryCue || hasDetailStep || (latestCue && !candidateCue) || (entityCue && hasSingleResultFetch && !candidateCue)) {
    inferred.push("content_understanding");
  }

  const searchLike = analysis.intent === "search"
    || normalizeKeywords(analysis.keywords).length > 0
    || (!browseCue && !entityCue && !comparisonCue);

  if (searchLike && !inferred.includes("browse_feed") && !inferred.includes("entity_lookup") && !inferred.includes("comparison_or_review")) {
    inferred.push("search_discovery");
  }

  return TASK_SUBTYPES.filter((item) => unique(inferred).includes(item));
}

function inferPrimarySubtype(subtypes, task, analysis = {}) {
  const text = buildAnalysisText(task, analysis);
  const normalized = TASK_SUBTYPES.filter((item) => (subtypes || []).includes(item));

  if (normalized.length === 0) {
    return analysis.intent === "browse" ? "browse_feed" : "search_discovery";
  }

  if (hasComparisonCue(text) && normalized.includes("comparison_or_review")) {
    return "comparison_or_review";
  }
  if (hasSummaryCue(text) && normalized.includes("content_understanding")) {
    return "content_understanding";
  }
  if (hasLatestCue(text) && normalized.includes("latest_content_fetch")) {
    return "latest_content_fetch";
  }
  if (normalized.includes("entity_lookup")) {
    return "entity_lookup";
  }
  if (normalized.includes("content_understanding")) {
    return "content_understanding";
  }
  if (normalized.includes("search_discovery")) {
    return "search_discovery";
  }
  if (normalized.includes("browse_feed")) {
    return "browse_feed";
  }

  return normalized[0];
}

function normalizeIntent(rawIntent, subtypes, analysis = {}) {
  if (rawIntent === "search" || rawIntent === "browse") {
    return rawIntent;
  }

  if (subtypes.includes("browse_feed") && subtypes.length === 1) {
    return "browse";
  }

  if (normalizeKeywords(analysis.keywords).length > 0 || subtypes.some((item) => item !== "browse_feed")) {
    return "search";
  }

  return "browse";
}

function normalizeTaskAnalysis(task, analysis = {}, plan = []) {
  const normalizedKeywords = normalizeKeywords(analysis.keywords);
  const seededAnalysis = {
    ...(analysis || {}),
    keywords: normalizedKeywords,
  };

  const subtypes = inferTaskSubtypes(task, seededAnalysis, plan);
  const primarySubtype = inferPrimarySubtype(subtypes, task, seededAnalysis);
  const intent = normalizeIntent(normalizeWhitespace(analysis?.intent || "").toLowerCase(), subtypes, seededAnalysis);

  return {
    ...(analysis || {}),
    intent,
    target_site: normalizeWhitespace(analysis?.target_site || ""),
    keywords: normalizedKeywords,
    goal: normalizeWhitespace(analysis?.goal || ""),
    subtypes,
    task_types: subtypes,
    primary_subtype: primarySubtype,
  };
}

function describeIntent(intent) {
  return intent === "search" ? "明确搜索" : "漫游浏览";
}

function describeSubtype(subtype) {
  return TASK_SUBTYPE_DESCRIPTIONS[subtype] || subtype;
}

module.exports = {
  TASK_SUBTYPES,
  TASK_SUBTYPE_DESCRIPTIONS,
  normalizeTaskAnalysis,
  inferTaskSubtypes,
  inferPrimarySubtype,
  describeIntent,
  describeSubtype,
};
