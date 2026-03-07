"use strict";

const { runAgentTask } = require("../../flows/orchestrator");
const { saveExtractedContent } = require("../../launcher");
const { normalizeText } = require("../../shared/utils");

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeInput(input) {
  if (typeof input === "string") {
    return {
      taskId: "",
      prompt: normalizeText(input),
      timeoutMs: undefined,
      maxSteps: undefined,
      debugMode: false,
      cdpUrl: "",
      keepOpen: undefined,
      keepOpenOnHuman: undefined,
    };
  }

  const data = input && typeof input === "object" ? input : {};
  return {
    taskId: normalizeText(data.task_id || data.taskId || ""),
    prompt: normalizeText(data.prompt || data.task || ""),
    timeoutMs: data.timeout_ms ?? data.timeoutMs,
    maxSteps: data.max_steps ?? data.maxSteps,
    debugMode: toBool(data.debug_mode ?? data.debugMode, false),
    cdpUrl: normalizeText(data.cdp_url || data.cdpUrl || ""),
    keepOpen: data.keep_open == null ? undefined : toBool(data.keep_open, false),
    keepOpenOnHuman: data.keep_open_on_human == null ? undefined : toBool(data.keep_open_on_human, true),
  };
}

function mapStatus(rawResult) {
  if (rawResult?.success) return "completed";
  if (rawResult?.meta?.requires_human) return "waiting_human";
  return "failed";
}

function buildArtifacts(rawResult, outputFile) {
  const artifacts = [];
  const screenshotPath = normalizeText(rawResult?.meta?.screenshot_path || "");

  if (outputFile) {
    artifacts.push({
      kind: "report",
      type: "markdown",
      path: outputFile,
    });
  }

  if (screenshotPath) {
    artifacts.push({
      kind: "screenshot",
      type: "image",
      path: screenshotPath,
    });
  }

  return artifacts;
}

function buildSummary(rawResult) {
  const summary = normalizeText(rawResult?.meta?.conclusion?.summary || "");
  if (summary) return summary;
  return normalizeText(rawResult?.message || "");
}

function mapOpenClawResult(rawResult, context = {}) {
  const outputFile = context.outputFile || null;
  const screenshotPath = normalizeText(rawResult?.meta?.screenshot_path || "");

  return {
    task_id: normalizeText(context.taskId || ""),
    status: mapStatus(rawResult),
    success: Boolean(rawResult?.success),
    message: normalizeText(rawResult?.message || ""),
    summary: buildSummary(rawResult),
    requires_human: Boolean(rawResult?.meta?.requires_human),
    retry_hint: normalizeText(rawResult?.meta?.retry_hint || ""),
    exit_code: Number.isFinite(rawResult?.exit_code) ? rawResult.exit_code : 1,
    url: normalizeText(rawResult?.meta?.url || ""),
    screenshot: rawResult?.has_screenshot ? {
      path: screenshotPath || "",
      base64: rawResult?.screenshot || "",
      mime_type: "image/jpeg",
    } : null,
    artifact_files: [outputFile, screenshotPath].filter(Boolean),
    artifacts: buildArtifacts(rawResult, outputFile),
    raw_result: rawResult,
  };
}

async function runOpenClawTask(input, deps = {}) {
  const normalized = normalizeInput(input);
  const runner = deps.runAgentTask || runAgentTask;
  const saveResult = deps.saveExtractedContent || saveExtractedContent;

  if (!normalized.prompt) {
    throw new Error("prompt is required");
  }

  const rawResult = await runner(normalized.prompt, {
    taskId: normalized.taskId || undefined,
    timeoutMs: normalized.timeoutMs,
    maxSteps: normalized.maxSteps,
    debugMode: normalized.debugMode,
    cdpUrl: normalized.cdpUrl || undefined,
    keepOpen: normalized.keepOpen,
    keepOpenOnHuman: normalized.keepOpenOnHuman,
  });

  const outputFile = saveResult ? saveResult(rawResult) : null;
  return mapOpenClawResult(rawResult, {
    taskId: normalized.taskId,
    outputFile,
  });
}

module.exports = {
  runOpenClawTask,
  mapOpenClawResult,
  normalizeInput,
  __internal: {
    buildArtifacts,
    buildSummary,
    mapStatus,
    toBool,
  },
};
