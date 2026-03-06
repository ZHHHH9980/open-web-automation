"use strict";

const path = require("path");
const os = require("os");

/**
 * Generate unique task ID for this execution
 * @returns {string} Unique task ID
 */
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get extraction file path for this task
 * @param {string} taskId - Task ID
 * @returns {string} File path for extraction data
 */
function getExtractionFilePath(taskId) {
  return path.join(os.tmpdir(), `owa_extract_${taskId}.txt`);
}

/**
 * Normalize text by collapsing whitespace
 * @param {string} s - Input string
 * @returns {string} Normalized string
 */
function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/**
 * Convert value to integer with fallback
 * @param {*} v - Value to convert
 * @param {number} fallback - Fallback value if conversion fails
 * @returns {number} Integer value
 */
function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/**
 * Log progress message to stderr
 * @param {boolean} enabled - Whether logging is enabled
 * @param {string} msg - Message to log
 */
function logProgress(enabled, msg) {
  if (!enabled) return;
  process.stderr.write(`[agent] ${msg}\n`);
}

module.exports = {
  generateTaskId,
  getExtractionFilePath,
  normalizeText,
  toInt,
  logProgress,
};
