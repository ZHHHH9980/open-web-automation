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
    summary: `已围绕任务“${task}”整理 ${extractedData.length} 条采集记录，重点涵盖：${labels.slice(0, 3).join("；") || "相关内容"}。以下总结基于已采集的列表与详情数据自动生成，便于快速回看与继续分析。`,
    links,
    keyPoints,
  };
}

module.exports = { generateConclusion };
