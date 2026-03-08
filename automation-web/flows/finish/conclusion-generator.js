"use strict";

const { normalizeTaskAnalysis } = require("../plan/task-analysis");

const REASONING_MARKERS = [
  "核心",
  "关键",
  "原因",
  "适合",
  "问题",
  "优势",
  "结论",
  "判断",
  "因为",
  "所以",
  "因此",
  "但是",
  "不过",
  "意味着",
  "说明",
  "表明",
  "能力",
  "成本",
  "风险",
  "建议",
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactJson(text, limit = 800) {
  const normalized = normalizeText(text);
  return normalized.slice(0, limit);
}

function unique(values, limit = 10) {
  return Array.from(new Set((values || []).filter(Boolean))).slice(0, limit);
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？!?；;])/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function cleanSentence(sentence) {
  return normalizeText(String(sentence || "").replace(/[。；;，,]+$/g, ""));
}

function formatPublishTime(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function containsReasoningMarker(text) {
  return REASONING_MARKERS.some((marker) => text.includes(marker));
}

function inferLeadSkipCount(totalSentences, analysis) {
  if (!analysis?.subtypes?.includes("content_understanding")) {
    return 0;
  }
  if (totalSentences >= 5) {
    return 2;
  }
  if (totalSentences >= 3) {
    return 1;
  }
  return 0;
}

function scoreSentence(sentence, context = {}) {
  const text = cleanSentence(sentence);
  if (!text || text.length < 10) return -Infinity;

  const sentenceIndex = Number(context.sentenceIndex || 0);
  const totalSentences = Number(context.totalSentences || 0);
  const skipLeadingCount = Number(context.skipLeadingCount || 0);
  const preferReasoning = Boolean(context.preferReasoning);

  let score = 0;
  const length = text.length;
  score += Math.min(length, 72);

  if (length >= 18 && length <= 68) score += 18;
  if (length > 90) score -= 10;
  if (containsReasoningMarker(text)) score += preferReasoning ? 60 : 24;
  if (/[：:]/.test(text)) score += 8;
  if (/(但是|不过|因此|所以|因为)/.test(text)) score += 12;

  if (sentenceIndex < skipLeadingCount) {
    score -= 40;
  } else if (totalSentences > 0) {
    const relativeIndex = sentenceIndex / Math.max(1, totalSentences - 1);
    score += Math.round(relativeIndex * 12);
  }

  return score;
}

function pickKeySentences(text, limit = 3, options = {}) {
  const sentences = splitSentences(text).map(cleanSentence).filter((item, index, arr) => arr.indexOf(item) === index);
  const skipLeadingCount = Number.isFinite(Number(options.skipLeadingCount))
    ? Number(options.skipLeadingCount)
    : 0;
  const preferReasoning = Boolean(options.preferReasoning);

  const scored = sentences
    .map((item, index) => ({
      text: item,
      index,
      score: scoreSentence(item, {
        sentenceIndex: index,
        totalSentences: sentences.length,
        skipLeadingCount,
        preferReasoning,
      }),
    }))
    .filter((item) => item.index >= skipLeadingCount)
    .filter((item) => item.score > -40)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index);

  return scored.map((item) => item.text);
}

function extractStructuredResults(extractedData) {
  const results = [];

  for (const item of extractedData || []) {
    const parsed = item?.parsed || null;

    if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
      parsed.items.forEach((entry) => {
        results.push({
          label: entry?.title || item.label || item.action || "未命名内容",
          author: entry?.author || "",
          summary: normalizeText(entry?.content_summary || ""),
          content: normalizeText(entry?.article_content || ""),
          link: entry?.detail_url || "",
          publish_time: Number(entry?.publish_time || 0) || 0,
        });
      });
      continue;
    }

    if (parsed?.detail && typeof parsed.detail === "object") {
      const detail = parsed.detail;
      const videoLink = detail?.video?.media?.stream?.h264?.[0]?.master_url
        || detail?.video?.media?.stream?.h265?.[0]?.master_url
        || "";
      results.push({
        label: detail?.title || item.label || item.action || "未命名内容",
        author: detail?.user?.nickname || detail?.author || "",
        summary: normalizeText(detail?.desc || detail?.content_summary || ""),
        content: normalizeText(detail?.desc || detail?.content_summary || ""),
        link: detail?.detail_url || detail?.share_info?.link || videoLink || "",
        publish_time: Number(detail?.time || detail?.last_update_time || 0) || 0,
      });
      continue;
    }

    results.push({
      label: item?.label || item?.action || "未命名内容",
      author: "",
      summary: compactJson(item?.content || ""),
      content: compactJson(item?.content || ""),
      link: "",
      publish_time: 0,
    });
  }

  return results;
}

function getSubtypeState(task, taskAnalysis, results) {
  return normalizeTaskAnalysis(task, taskAnalysis || {}, [
    ...(Array.isArray(results) && results.length === 1 ? [{ action: "scrape_list", max_items: 1 }] : []),
  ]);
}

function buildCandidateLabel(item, index, options = {}) {
  const prefix = options.prefix || `候选${index + 1}`;
  const title = cleanSentence(item?.label || "未命名内容");
  const author = cleanSentence(item?.author || "");
  if (author) {
    return `${prefix}：${title}（作者：${author}）`;
  }
  return `${prefix}：${title}`;
}

function buildDiscoverySummary(results, task, noun) {
  const labels = results.slice(0, 3).map((item) => cleanSentence(item.label)).filter(Boolean).join("；");
  return `围绕任务“${task}”共整理 ${results.length} 条${noun}，优先包括：${labels || "相关内容"}。`;
}

function buildDiscoveryKeyPoints(results, noun) {
  return results
    .slice(0, 5)
    .map((item, index) => buildCandidateLabel(item, index, { prefix: `${noun}${index + 1}` }));
}

function buildFocusedSummary(results, task, analysis) {
  const first = results[0] || {};
  const author = cleanSentence(first.author || "目标主体");
  const title = cleanSentence(first.label || "未命名内容");
  const sentences = splitSentences(first.content || first.summary);
  const keySentences = pickKeySentences(first.content || first.summary, 2, {
    preferReasoning: true,
    skipLeadingCount: inferLeadSkipCount(sentences.length, analysis),
  });
  const detail = keySentences.length > 0 ? `重点在于：${keySentences.join("；")}。` : "";

  if (analysis.subtypes.includes("latest_content_fetch")) {
    return `围绕任务“${task}”，已定位到${author}的最新内容《${title}》。${detail}`;
  }

  if (analysis.subtypes.includes("entity_lookup")) {
    return `围绕任务“${task}”，已定位到目标内容《${title}》，来源主体为${author}。${detail}`;
  }

  return `围绕任务“${task}”共整理 ${results.length} 条结果，重点内容是《${title}》。${detail}`;
}

function buildFocusedKeyPoints(results, analysis) {
  const first = results[0] || {};
  const points = [];

  if (first.label) {
    points.push(`${analysis.subtypes.includes("latest_content_fetch") ? "最新标题" : "标题"}：${cleanSentence(first.label)}`);
  }

  if (first.author) {
    points.push(`主体：${cleanSentence(first.author)}`);
  }

  const publishTime = formatPublishTime(first.publish_time);
  if (publishTime) {
    points.push(`时间：${publishTime}`);
  }

  const sentences = splitSentences(first.content || first.summary);
  pickKeySentences(first.content || first.summary, 4, {
    preferReasoning: true,
    skipLeadingCount: inferLeadSkipCount(sentences.length, analysis),
  }).forEach((sentence) => {
    points.push(sentence);
  });

  return unique(points, 6);
}

function buildComparisonSummary(results, task) {
  const labels = results.slice(0, 3).map((item) => cleanSentence(item.label)).filter(Boolean).join("；");
  return `围绕任务“${task}”共整理 ${results.length} 个可对比对象，当前重点包括：${labels || "相关对象"}。`;
}

function buildComparisonKeyPoints(results) {
  return results.slice(0, 5).map((item, index) => buildCandidateLabel(item, index, { prefix: `对比对象${index + 1}` }));
}

function buildSummary(results, task, analysis) {
  if (analysis.subtypes.includes("comparison_or_review")) {
    return buildComparisonSummary(results, task);
  }

  if (analysis.subtypes.includes("browse_feed")) {
    return buildDiscoverySummary(results, task, "浏览内容");
  }

  if (analysis.subtypes.includes("search_discovery") && !analysis.subtypes.includes("content_understanding") && !analysis.subtypes.includes("latest_content_fetch") && !analysis.subtypes.includes("entity_lookup")) {
    return buildDiscoverySummary(results, task, "候选结果");
  }

  return buildFocusedSummary(results, task, analysis);
}

function buildKeyPoints(results, analysis) {
  if (analysis.subtypes.includes("comparison_or_review")) {
    return buildComparisonKeyPoints(results);
  }

  if (analysis.subtypes.includes("browse_feed")) {
    return buildDiscoveryKeyPoints(results, "浏览项");
  }

  if (analysis.subtypes.includes("search_discovery") && !analysis.subtypes.includes("content_understanding") && !analysis.subtypes.includes("latest_content_fetch") && !analysis.subtypes.includes("entity_lookup")) {
    return buildDiscoveryKeyPoints(results, "候选");
  }

  return buildFocusedKeyPoints(results, analysis);
}

async function generateConclusion(extractedData, task, _model, opts = {}) {
  if (!Array.isArray(extractedData) || extractedData.length === 0) {
    return null;
  }

  const results = extractStructuredResults(extractedData)
    .slice()
    .sort((left, right) => Number(right.publish_time || 0) - Number(left.publish_time || 0));
  const links = unique(results.map((item) => item.link));
  const analysis = getSubtypeState(task, opts.taskAnalysis || {}, results);

  return {
    summary: buildSummary(results, task, analysis),
    links,
    keyPoints: buildKeyPoints(results, analysis),
    task_analysis: analysis,
  };
}

module.exports = {
  generateConclusion,
  __internal: {
    extractStructuredResults,
    splitSentences,
    pickKeySentences,
    formatPublishTime,
    scoreSentence,
    buildSummary,
    buildKeyPoints,
    inferLeadSkipCount,
  },
};
