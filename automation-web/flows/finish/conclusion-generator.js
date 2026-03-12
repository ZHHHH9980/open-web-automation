"use strict";

const { normalizeTaskAnalysis } = require("../plan/task-analysis");
const { resolveLocalCodexProvider } = require("../../shared/codex-config");
const { buildCodexGeneratorLabel, runCodexJsonPrompt } = require("../../shared/codex-cli");

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

const LOW_VALUE_PATTERNS = [
  /很有意思/,
  /挺有意思/,
  /蛮有意思/,
  /有感而发/,
  /没想到/,
  /莫名其妙/,
  /真的也?挺感慨/,
  /这个观点之所以这么说/,
  /我估计.+没想到/,
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

function isLowValueSentence(text) {
  return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

function isDanglingClause(text) {
  const normalized = cleanSentence(text);
  if (!normalized) return false;

  if (/(的时候|之时|的话|之前|之后|之下|情况下)$/.test(normalized)) {
    return true;
  }

  if (/^(当|如果|假如|倘若|随着)/.test(normalized) && !/(所以|因此|这意味着|这说明|那么|就会)/.test(normalized)) {
    return true;
  }

  return false;
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
  if (isLowValueSentence(text)) score -= 80;
  if (isDanglingClause(text)) score -= 120;
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
    .filter((item) => !isDanglingClause(item.text))
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

  let lead = `围绕任务“${task}”，已定位到${author}的最新内容《${title}》。`;
  if (analysis.subtypes.includes("entity_lookup") && !analysis.subtypes.includes("latest_content_fetch")) {
    lead = `围绕任务“${task}”，已定位到目标内容《${title}》，来源主体为${author}。`;
  } else if (!analysis.subtypes.includes("latest_content_fetch") && !analysis.subtypes.includes("entity_lookup")) {
    lead = `围绕任务“${task}”共整理 ${results.length} 条结果，重点内容是《${title}》。`;
  }

  if (keySentences.length === 0) {
    return lead;
  }

  const detailLead = keySentences.length > 1 ? "文章的核心观点有两点：" : "文章的核心观点是：";
  return `${lead}${detailLead}${keySentences.join("；")}。`;
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

function getOpenAIConclusionConfig(model) {
  const apiKey = process.env.OWA_AGENT_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    base: String(
      process.env.OWA_AGENT_BASE_URL || process.env.OPENAI_BASE_URL || process.env.OWA_PLANNER_BASE_URL || "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model: model || process.env.OWA_AGENT_MODEL || process.env.OWA_PLANNER_MODEL || "gpt-5.4",
    timeoutMs: Math.max(5000, Number(process.env.OWA_AGENT_PLAN_TIMEOUT_MS || 60000) || 60000),
  };
}

function buildConclusionInput(results, task, analysis) {
  return {
    task,
    task_analysis: {
      intent: analysis.intent || "",
      target_site: analysis.target_site || "",
      subtypes: Array.isArray(analysis.subtypes) ? analysis.subtypes : [],
      primary_subtype: analysis.primary_subtype || "",
      goal: analysis.goal || "",
    },
    items: results.slice(0, 4).map((item, index) => ({
      rank: index + 1,
      title: cleanSentence(item.label || ""),
      author: cleanSentence(item.author || ""),
      publish_time: formatPublishTime(item.publish_time),
      link: String(item.link || "").trim(),
      summary: normalizeText(item.summary || "").slice(0, 600),
      content: normalizeText(item.content || "").slice(0, 1800),
    })),
  };
}

function normalizeModelConclusion(raw, fallbackLinks, analysis, generator) {
  if (!raw || typeof raw !== "object") return null;

  const summary = normalizeText(raw.summary || "");
  const keyPoints = unique((raw.keyPoints || raw.key_points || []).map((item) => normalizeText(item)), 6);
  const links = unique((raw.links || []).map((item) => normalizeText(item)).filter(Boolean));

  if (!summary) return null;

  return {
    summary,
    keyPoints,
    links: links.length > 0 ? links : fallbackLinks,
    task_analysis: analysis,
    generator,
  };
}

function buildOpenAIGeneratorInfo(config, status, error = "") {
  const modelName = config?.model || process.env.OWA_AGENT_MODEL || process.env.OWA_PLANNER_MODEL || "gpt-5.4";
  return {
    mode: "model",
    provider: "openai",
    model: modelName,
    label: `OpenAI ${modelName}`,
    status,
    error: normalizeText(error || ""),
  };
}

function buildCodexGeneratorInfo(model, status, error = "") {
  const modelName = String(model || process.env.OWA_AGENT_CODEX_MODEL || process.env.OWA_AGENT_MODEL || "gpt-5.4").trim();
  return {
    mode: "model",
    provider: "codex",
    model: modelName,
    label: buildCodexGeneratorLabel(modelName),
    status,
    error: normalizeText(error || ""),
  };
}

function buildConclusionPrompt(payload) {
  return [
    "你是一个高质量信息总结器。",
    "只输出一个 JSON 对象，不要 markdown，不要解释。",
    'JSON schema: {"summary": string, "keyPoints": string[], "links": string[] }.',
    "summary 用 2-4 句，直接回答任务结果，必须具体，禁止空话套话。",
    "keyPoints 输出 3-6 条，每条都必须是内容里的具体判断、原因、事实或结论。",
    "不要输出类似‘很有意思’‘值得关注’‘重点在于’这类空泛评价，除非后面紧跟具体观点。",
    "links 只保留输入里已有的链接。",
    "下面是任务与内容，请基于它们生成 JSON。",
    JSON.stringify(payload),
  ].join("\n\n");
}

async function tryGenerateConclusionWithCodex(results, task, model, analysis) {
  const provider = resolveLocalCodexProvider(process.env);
  if (!provider?.has_api_key) {
    return {
      conclusion: null,
      generator: buildCodexGeneratorInfo(model, "unavailable", "local Codex provider is unavailable or missing its configured env key"),
    };
  }

  const payload = buildConclusionInput(results, task, analysis);
  const ret = runCodexJsonPrompt(
    buildConclusionPrompt(payload),
    model || process.env.OWA_AGENT_CODEX_MODEL || process.env.OWA_AGENT_MODEL || "gpt-5.4",
    {
      timeoutMs: process.env.OWA_AGENT_PLAN_TIMEOUT_MS,
      reasoning: process.env.OWA_AGENT_CODEX_REASONING || "medium",
    }
  );

  if (!ret.ok) {
    return {
      conclusion: null,
      generator: buildCodexGeneratorInfo(model, "failed", ret.error),
    };
  }

  return {
    conclusion: normalizeModelConclusion(ret.parsed, unique(results.map((item) => item.link)), analysis, buildCodexGeneratorInfo(model, "success")),
    generator: buildCodexGeneratorInfo(model, "success"),
  };
}

async function tryGenerateConclusionWithOpenAI(results, task, model, analysis) {
  const config = getOpenAIConclusionConfig(model);
  if (!config) {
    return {
      conclusion: null,
      generator: buildOpenAIGeneratorInfo({ model }, "unavailable", "missing OWA_AGENT_API_KEY/OPENAI_API_KEY"),
    };
  }

  const promptPayload = buildConclusionInput(results, task, analysis);
  const system = [
    "你是一个高质量信息总结器。",
    "只输出一个 JSON 对象，不要 markdown，不要解释。",
    'JSON schema: {"summary": string, "keyPoints": string[], "links": string[] }.',
    "summary 用 2-4 句，直接回答任务结果，必须具体，禁止空话套话。",
    "keyPoints 输出 3-6 条，每条都必须是内容里的具体判断、原因、事实或结论。",
    "不要输出类似‘很有意思’‘值得关注’‘重点在于’这类空泛评价，除非后面紧跟具体观点。",
    "links 只保留输入里已有的链接。",
  ].join("\n");

  const body = {
    model: config.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: JSON.stringify(promptPayload) }] },
    ],
    response_format: { type: "json_object" },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const resp = await fetch(`${config.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      return {
        conclusion: null,
        generator: buildOpenAIGeneratorInfo(config, "failed", `http ${resp.status} ${errorText.replace(/\s+/g, " ").trim().slice(0, 240)}`),
      };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    const contentText = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((x) => (typeof x === "string" ? x : (x?.text || ""))).join("\n")
        : "";
    const jsonText = contentText.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) {
      return {
        conclusion: null,
        generator: buildOpenAIGeneratorInfo(config, "failed", "chat completions returned non-json content"),
      };
    }

    const parsed = JSON.parse(jsonText);
    return {
      conclusion: normalizeModelConclusion(parsed, unique(results.map((item) => item.link)), analysis, buildOpenAIGeneratorInfo(config, "success")),
      generator: buildOpenAIGeneratorInfo(config, "success"),
    };
  } catch (err) {
    return {
      conclusion: null,
      generator: buildOpenAIGeneratorInfo(config, err && err.name === "AbortError" ? "timeout" : "failed", err?.message || err || "OpenAI conclusion generation failed"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function generateConclusionResult(extractedData, task, model, opts = {}) {
  if (!Array.isArray(extractedData) || extractedData.length === 0) {
    return { conclusion: null, generator: null };
  }

  const results = extractStructuredResults(extractedData)
    .slice()
    .sort((left, right) => Number(right.publish_time || 0) - Number(left.publish_time || 0));
  const analysis = getSubtypeState(task, opts.taskAnalysis || {}, results);

  const provider = resolveLocalCodexProvider(process.env);
  if (provider?.has_api_key) {
    return tryGenerateConclusionWithCodex(results, task, model, analysis);
  }

  return tryGenerateConclusionWithOpenAI(results, task, model, analysis);
}

async function generateConclusion(extractedData, task, model, opts = {}) {
  const result = await generateConclusionResult(extractedData, task, model, opts);
  return result?.conclusion || null;
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
    isDanglingClause,
    buildConclusionInput,
    normalizeModelConclusion,
    buildOpenAIGeneratorInfo,
  },
  generateConclusionResult,
};
