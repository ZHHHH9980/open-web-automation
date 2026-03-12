"use strict";

const { markHumanPauseTab } = require("../init/browser");
const { toResult } = require("./result");
const { normalizeText } = require("../../shared/utils");
const { data: dataHandler } = require("../act/actions");

async function finalizeCompletedTask({ page, task, taskAnalysis, execRet, history, extractedCount, extractionFile, model, opts, progress }) {
  const finalUrl = page.url();
  const conclusionResult = await dataHandler.generateFinalConclusion(
    extractionFile,
    extractedCount,
    task,
    taskAnalysis,
    model,
    opts,
    progress,
  );
  const conclusion = conclusionResult?.conclusion || null;
  const conclusionGenerator = conclusionResult?.generator || conclusion?.generator || null;

  const extractDom = process.env.OWA_EXTRACT_DOM === "1" || opts.extractDom;
  const domData = await dataHandler.extractDomData(page, extractDom, progress);

  return toResult({
    success: execRet.success,
    exit_code: execRet.success ? 0 : (execRet.requiresHuman ? 2 : 1),
    message: execRet.result,
    meta: {
      requires_human: execRet.requiresHuman || false,
      task,
      task_analysis: taskAnalysis || null,
      steps: history,
      data: execRet.data || {},
      extracted_count: extractedCount,
      extraction_file: extractedCount > 0 ? extractionFile : null,
      conclusion,
      conclusion_generator: conclusionGenerator,
      url: finalUrl,
      dom_data: extractDom ? domData : undefined,
    },
  });
}

function buildTimeoutResult({ task, history, timeoutMs, lastUrl }) {
  return toResult({
    success: false,
    exit_code: 124,
    message: `task timeout (${timeoutMs}ms)`,
    meta: {
      requires_human: false,
      task,
      steps: history,
      url: lastUrl,
    },
  });
}

function buildPlanGenerationFailedResult(task) {
  return toResult({
    success: false,
    exit_code: 4,
    message: "plan generation failed",
    meta: { requires_human: false, task },
  });
}

function buildInitialUrlFailureResult(task, error) {
  return toResult({
    success: false,
    exit_code: 4,
    message: `initial URL resolution failed: ${error}`,
    meta: { requires_human: false, task },
  });
}

function buildPlanExhaustedResult({ task, step, url }) {
  return toResult({
    success: false,
    exit_code: 4,
    message: "execution plan exhausted before task completion",
    meta: { requires_human: false, task, step, url },
  });
}

function buildActionNotExecutableResult({ task, step, url, plannedAction, reason }) {
  return toResult({
    success: false,
    exit_code: 4,
    message: `planned action not executable: ${plannedAction?.action || "unknown"}`,
    meta: { requires_human: false, task, step, url, planned_action: plannedAction, reason },
  });
}

function buildHumanPauseResult({ task, step, url, reason, block, screenshot, screenshotPath }) {
  return toResult({
    success: false,
    exit_code: 2,
    message: reason || "human intervention required",
    screenshot,
    meta: {
      requires_human: true,
      task,
      step,
      url,
      human_block: block,
      screenshot_path: screenshotPath,
    },
  });
}

function buildMaxStepsResult({ task, history, maxSteps, lastUrl }) {
  return toResult({
    success: false,
    exit_code: 4,
    message: `max steps reached (${maxSteps})`,
    meta: {
      requires_human: false,
      task,
      steps: history,
      url: lastUrl,
    },
  });
}

async function cleanupRuntime({ page, browser, keepOpen, keepOpenOnHuman, requiresHuman }) {
  if (browser && page && requiresHuman && keepOpenOnHuman) {
    try {
      await markHumanPauseTab(page);
    } catch (_err) {
      // ignore cleanup errors
    }
  }

  if (browser && (!requiresHuman || !keepOpenOnHuman) && !keepOpen) {
    try {
      await browser.close();
    } catch (_err) {
      // ignore cleanup errors
    }
  }
}

function buildAgentFailureResult({ task, history, error, lastUrl }) {
  return toResult({
    success: false,
    exit_code: 1,
    message: normalizeText(error?.message || error || "agent task failed"),
    meta: {
      requires_human: false,
      task,
      steps: history,
      url: lastUrl,
    },
  });
}

module.exports = {
  finalizeCompletedTask,
  buildTimeoutResult,
  buildPlanGenerationFailedResult,
  buildInitialUrlFailureResult,
  buildPlanExhaustedResult,
  buildActionNotExecutableResult,
  buildHumanPauseResult,
  buildMaxStepsResult,
  buildAgentFailureResult,
  cleanupRuntime,
};
