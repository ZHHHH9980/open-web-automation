"use strict";

const {
  finalizeCompletedTask,
  buildTimeoutResult,
  buildPlanExhaustedResult,
  buildActionNotExecutableResult,
  buildHumanPauseResult,
  buildMaxStepsResult,
} = require("../finish/finalize-task");
const { normalizeText, logProgress } = require("../../shared/utils");
const { makeScreenshot } = require("../init/browser");

function buildTimeoutExit({ task, history, timeoutMs, lastUrl, requiresHuman }) {
  return {
    result: buildTimeoutResult({ task, history, timeoutMs, lastUrl }),
    requiresHuman,
  };
}

function buildPlanExhaustedExit({ task, step, url, requiresHuman }) {
  return {
    result: buildPlanExhaustedResult({ task, step, url }),
    requiresHuman,
  };
}

function buildActionNotExecutableExit({ task, step, url, plannedAction, reason, requiresHuman }) {
  return {
    result: buildActionNotExecutableResult({ task, step, url, plannedAction, reason }),
    requiresHuman,
  };
}

async function buildHumanBlockExit({ page, task, step, state, progress, requiresHuman }) {
  logProgress(progress, `human intervention required: ${state.human_block.reason}`);

  let screenshotPath = "";
  let screenshotBase64 = "";
  try {
    const screenshot = await makeScreenshot(page, "human-block");
    screenshotPath = screenshot.filePath || "";
    screenshotBase64 = screenshot.base64 || "";
  } catch (err) {
    logProgress(progress, `human-block screenshot failed: ${normalizeText(err.message || err)}`);
  }

  return {
    result: buildHumanPauseResult({
      task,
      step,
      url: state.url,
      reason: state.human_block.reason,
      block: state.human_block,
      screenshot: screenshotBase64,
      screenshotPath,
    }),
    requiresHuman,
  };
}

async function buildCompletedExit({
  page,
  task,
  execRet,
  history,
  extractedCount,
  extractionFile,
  model,
  opts,
  progress,
  requiresHuman,
}) {
  return {
    result: await finalizeCompletedTask({
      page,
      task,
      execRet,
      history,
      extractedCount,
      extractionFile,
      model,
      opts,
      progress,
    }),
    requiresHuman,
  };
}

function buildMaxStepsExit({ task, history, maxSteps, lastUrl, requiresHuman }) {
  return {
    result: buildMaxStepsResult({ task, history, maxSteps, lastUrl }),
    requiresHuman,
  };
}

module.exports = {
  buildTimeoutExit,
  buildPlanExhaustedExit,
  buildActionNotExecutableExit,
  buildHumanBlockExit,
  buildCompletedExit,
  buildMaxStepsExit,
};
