"use strict";

function collectLinks(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s"')]+/g) || [];
  return Array.from(new Set(matches)).slice(0, 10);
}

function compactJson(text, limit = 800) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.slice(0, limit);
}

function buildKeyPoints(extractedData) {
  return extractedData
    .map((item) => item.label || item.action || "未命名内容")
    .filter(Boolean)
    .slice(0, 5);
}

async function generateConclusion(extractedData, task, _model, _opts = {}) {
  if (!Array.isArray(extractedData) || extractedData.length === 0) {
    return null;
  }

  const labels = extractedData
    .map((item) => item.label || item.action || "未命名内容")
    .filter(Boolean);
  const contentPreview = extractedData
    .map((item, idx) => `[${idx + 1}] ${item.label || item.action || "未命名内容"}: ${compactJson(item.content)}`)
    .join("\n");
  const links = collectLinks(contentPreview);
  const keyPoints = buildKeyPoints(extractedData);

  return {
    summary: `围绕任务“${task}”共整理 ${extractedData.length} 条结果，重点：${labels.slice(0, 3).join("；") || "相关内容"}。`,
    links,
    keyPoints,
  };
}

module.exports = { generateConclusion };
