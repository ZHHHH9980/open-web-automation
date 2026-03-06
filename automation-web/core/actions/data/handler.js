"use strict";

const fs = require("fs");
const { logProgress } = require("../../utils");
const { generateConclusion } = require("../../conclusion-generator");

function serializeCapturedData(action, data) {
  if (action === "scrape_list") {
    return JSON.stringify({
      source: data.source || "api",
      count: data.count || (Array.isArray(data.items) ? data.items.length : 0),
      items: data.items || [],
    }, null, 2);
  }

  if (action === "scrape_detail") {
    return JSON.stringify({
      source: data.source || "api",
      detail: data.detail || {},
    }, null, 2);
  }

  return JSON.stringify(data || {}, null, 2);
}

function storeCapturedData(dataFile, capturedCount, action, data, debug) {
  const entry = [
    `--- Capture #${capturedCount} (${action}) ---`,
    serializeCapturedData(action, data),
    "",
  ].join("\n");

  fs.appendFileSync(dataFile, entry, "utf-8");

  if (debug) {
    process.stderr.write(`[agent] stored capture #${capturedCount}: ${action}\n`);
    process.stderr.write(`[agent] capture file: ${dataFile}\n`);
  }
}

async function generateFinalConclusion(dataFile, capturedCount, task, model, opts, progress) {
  if (capturedCount === 0 || !fs.existsSync(dataFile)) {
    return null;
  }

  logProgress(progress, "generating conclusion from captured data");
  try {
    return await generateConclusion(dataFile, task, model, { debugMode: opts.debugMode });
  } catch (err) {
    logProgress(progress, `conclusion generation failed: ${err.message}`);
    return null;
  }
}

async function extractDomData(page, extractDom, progress) {
  if (!extractDom) {
    return {};
  }

  logProgress(progress, "DOM extraction disabled in API-first mode");
  return {};
}

module.exports = {
  storeCapturedData,
  generateFinalConclusion,
  extractDomData,
};
