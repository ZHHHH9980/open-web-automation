"use strict";

const fs = require("fs");
const { logProgress } = require("../../shared/utils");
const { generateConclusionResult } = require("./conclusion-generator");

function serializeCapturedData(action, data) {
  if (["scrape_list", "select_list"].includes(action)) {
    const displayItems = Array.isArray(data.display_items) && data.display_items.length > 0
      ? data.display_items
      : (data.items || []);

    return JSON.stringify({
      source: data.source || "api",
      endpoint: data.endpoint || "",
      count: data.count || (Array.isArray(displayItems) ? displayItems.length : 0),
      items: displayItems,
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

function loadCapturedEntries(dataFile) {
  const raw = fs.readFileSync(dataFile, "utf-8");
  const parts = raw.split(/--- Capture #\d+ \(([^)]+)\) ---\n/g);
  const entries = [];

  for (let idx = 1; idx < parts.length; idx += 2) {
    const action = (parts[idx] || "").trim();
    const content = (parts[idx + 1] || "").trim();
    if (!action || !content) continue;

    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (_err) {
      parsed = null;
    }

    const label = parsed?.detail?.title || parsed?.items?.[0]?.title || `${action} capture`;
    entries.push({ action, label, content, parsed });
  }

  return entries;
}

async function generateFinalConclusion(dataFile, capturedCount, task, taskAnalysis, model, opts, progress) {
  if (capturedCount === 0 || !fs.existsSync(dataFile)) {
    return { conclusion: null, generator: null };
  }

  logProgress(progress, "generating conclusion from captured data");
  try {
    const extractedData = loadCapturedEntries(dataFile);
    const result = await generateConclusionResult(extractedData, task, model, { taskAnalysis, debugMode: opts.debugMode });
    if (result?.generator?.label) {
      const detail = result.generator.error ? ` (${result.generator.status}: ${result.generator.error})` : "";
      logProgress(progress, `conclusion generator: ${result.generator.label}${detail}`);
    }
    return result || { conclusion: null, generator: null };
  } catch (err) {
    logProgress(progress, `conclusion generation failed: ${err.message}`);
    return {
      conclusion: null,
      generator: {
        mode: "model",
        provider: "openai",
        model: model || process.env.OWA_AGENT_MODEL || process.env.OWA_PLANNER_MODEL || "gpt-5.4",
        label: `OpenAI ${model || process.env.OWA_AGENT_MODEL || process.env.OWA_PLANNER_MODEL || "gpt-5.4"}`,
        status: "failed",
        error: String(err.message || err),
      },
    };
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
  loadCapturedEntries,
  generateFinalConclusion,
  extractDomData,
};
