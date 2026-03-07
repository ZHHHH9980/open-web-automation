"use strict";

const fs = require("fs");
const path = require("path");

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getOutputDir() {
  return ensureDir(path.resolve(__dirname, "..", "outputs"));
}

function getTimestampParts(date = new Date()) {
  const iso = date.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 19).replace(/:/g, "-"),
  };
}

function sanitizeFileLabel(value, fallback = "unknown") {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || fallback;
}

function getPlatformLabelFromUrl(urlString) {
  try {
    const hostname = new URL(urlString).hostname.replace(/^www\./, "").toLowerCase();
    const directMap = {
      "xiaohongshu.com": "xiaohongshu",
      "zhihu.com": "zhihu",
      "bilibili.com": "bilibili",
      "goofish.com": "goofish",
      "taobao.com": "taobao",
      "jd.com": "jd",
      "weibo.com": "weibo",
      "douyin.com": "douyin",
    };
    if (directMap[hostname]) {
      return directMap[hostname];
    }
    const parts = hostname.split(".").filter(Boolean);
    return sanitizeFileLabel(parts[0] || hostname, "unknown");
  } catch (_err) {
    return "unknown";
  }
}

function buildOutputFilePath(prefix, suffix = "txt") {
  const { date, time } = getTimestampParts();
  const extension = String(suffix || "txt").replace(/^\./, "");
  const filePrefix = sanitizeFileLabel(prefix, "output");
  return path.join(getOutputDir(), `${filePrefix}_${date}_${time}.${extension}`);
}

function buildResultFilePath(urlString, suffix = "txt") {
  const { date, time } = getTimestampParts();
  const extension = String(suffix || "txt").replace(/^\./, "");
  const platform = getPlatformLabelFromUrl(urlString);
  return path.join(getOutputDir(), `${date}_${time}_${platform}.${extension}`);
}

function getExtractionFilePath(taskId) {
  return path.join(getOutputDir(), `extract_${taskId}.txt`);
}

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function logProgress(enabled, msg) {
  if (!enabled) return;
  process.stderr.write(`[agent] ${msg}
`);
}

module.exports = {
  buildOutputFilePath,
  buildResultFilePath,
  generateTaskId,
  getExtractionFilePath,
  getOutputDir,
  getPlatformLabelFromUrl,
  normalizeText,
  sanitizeFileLabel,
  toInt,
  logProgress,
};
