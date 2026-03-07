"use strict";

const { COMMON_SITES } = require("./act/site-config");
const { analyzeAndPlan, determineInitialUrl, initializeBrowser } = require("./init/task-initializer");
const { runExecutionLoop } = require("./act/run-loop");
const {
  buildAgentFailureResult,
  buildInitialUrlFailureResult,
  buildPlanGenerationFailedResult,
  cleanupRuntime,
} = require("./finish/finalize-task");
const { generateTaskId, getExtractionFilePath, normalizeText, toInt } = require("../shared/utils");
const { startApiCollection } = require("./act/state-collector");

function isSemanticallySameUrl(currentUrl, targetUrl) {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);

    if (current.origin !== target.origin) return false;
    if (current.pathname.replace(/\/$/, "") !== target.pathname.replace(/\/$/, "")) return false;

    for (const [key, value] of target.searchParams.entries()) {
      if (current.searchParams.get(key) !== value) {
        return false;
      }
    }

    return true;
  } catch (_err) {
    return false;
  }
}

function shouldDeferInitialNavigation(executionPlan, initialUrl) {
  const first = executionPlan?.[0];
  const second = executionPlan?.[1];
  if (!initialUrl || !first || !second) return false;
  if (first.action !== "listen") return false;
  if (second.action !== "goto" || !second.url) return false;

  if (isSemanticallySameUrl(initialUrl, second.url)) {
    return true;
  }

  try {
    const initial = new URL(initialUrl);
    const target = new URL(second.url);

    if (initial.origin !== target.origin) return false;
    if (initial.pathname.replace(/\/$/, "") !== target.pathname.replace(/\/$/, "")) return false;

    for (const [key, value] of initial.searchParams.entries()) {
      if (target.searchParams.get(key) !== value) {
        return false;
      }
    }

    return true;
  } catch (_err) {
    return false;
  }
}

async function runAgentTask(rawTask, opts = {}) {
  const task = normalizeText(rawTask);
  if (!task) {
    return buildPlanGenerationFailedResult(task);
  }

  const cdpUrl = opts.cdpUrl || process.env.WEB_CDP_URL || "http://127.0.0.1:9222";
  const maxSteps = Math.max(1, toInt(process.env.OWA_AGENT_MAX_STEPS, 30));
  const model = process.env.OWA_AGENT_CODEX_MODEL || "";
  const keepOpenOnHuman = process.env.WEB_KEEP_OPEN_ON_HUMAN !== "0";
  const keepOpen = opts.debugMode || process.env.WEB_KEEP_OPEN === "1";
  const debug = process.env.OWA_AGENT_DEBUG === "1";
  const progress = process.env.OWA_AGENT_PROGRESS !== "0";
  const timeoutMs = Math.max(1000, toInt(process.env.WEB_TASK_TIMEOUT_MS, 180000));
  const startedAt = Date.now();

  let browser;
  let page;
  let requiresHuman = false;

  const taskId = generateTaskId();
  const extractionFile = getExtractionFilePath(taskId);
  const executionContext = {
    startApiCollection,
    apiCollectors: [],
    currentApiCollector: null,
  };

  try {
    const { executionPlan, taskAnalysis } = await analyzeAndPlan(task, maxSteps, COMMON_SITES, progress);
    if (!executionPlan) {
      return buildPlanGenerationFailedResult(task);
    }

    const initialUrlResult = determineInitialUrl(taskAnalysis, progress);
    if (!initialUrlResult.ok) {
      return buildInitialUrlFailureResult(task, initialUrlResult.error);
    }

    const browserInit = await initializeBrowser(cdpUrl, initialUrlResult.url, progress, {
      skipInitialNavigation: shouldDeferInitialNavigation(executionPlan, initialUrlResult.url),
    });
    browser = browserInit.browser;
    page = browserInit.page;

    const loopRet = await runExecutionLoop({
      page,
      task,
      opts,
      model,
      progress,
      debug,
      maxSteps,
      timeoutMs,
      startedAt,
      executionPlan,
      extractionFile,
      executionContext,
    });
    requiresHuman = loopRet.requiresHuman;
    return loopRet.result;
  } catch (err) {
    return buildAgentFailureResult({ task, history: [], error: err, lastUrl: page?.url?.() || "" });
  } finally {
    await cleanupRuntime({ page, browser, keepOpen, keepOpenOnHuman, requiresHuman });
  }
}

module.exports = {
  runAgentTask,
  __internal: {
    isSemanticallySameUrl,
    shouldDeferInitialNavigation,
  },
};
