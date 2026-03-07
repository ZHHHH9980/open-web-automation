"use strict";

const { collectPageState } = require("./state-collector");
const { executeDecision } = require("./executor");
const { canExecutePlan, explainCannotExecutePlan } = require("../plan/task-planner");
const { logProgress, normalizeText } = require("../../shared/utils");
const { handlePostActionEffects, appendHistory, appendErrorHistory } = require("./run-loop-effects");
const {
  buildTimeoutExit,
  buildPlanExhaustedExit,
  buildActionNotExecutableExit,
  buildHumanBlockExit,
  buildCompletedExit,
  buildMaxStepsExit,
} = require("./run-loop-termination");

async function runExecutionLoop(params) {
  const {
    page,
    task,
    opts = {},
    model,
    progress,
    debug,
    maxSteps,
    timeoutMs,
    startedAt,
    executionPlan,
    extractionFile,
    executionContext,
  } = params;

  const history = [];
  let lastUrl = "";
  let extractedCount = 0;
  let requiresHuman = false;

  for (let step = 1; step <= maxSteps; step += 1) {
    if (Date.now() - startedAt > timeoutMs) {
      return buildTimeoutExit({ task, history, timeoutMs, lastUrl, requiresHuman });
    }

    const state = await collectPageState(page, step, 0, executionContext.currentApiCollector);
    lastUrl = state.url || lastUrl;

    if (state.human_block) {
      requiresHuman = true;
      return buildHumanBlockExit({ page, task, step, state, progress, requiresHuman });
    }

    logProgress(progress, `step ${step}/${maxSteps} url=${state.url || "about:blank"} planning...`);

    if (!executionPlan || executionPlan.length === 0) {
      return buildPlanExhaustedExit({ task, step, url: state.url, requiresHuman });
    }

    const plannedAction = executionPlan.shift();
    if (!canExecutePlan(plannedAction, state, executionContext)) {
      const reason = explainCannotExecutePlan(plannedAction, state, executionContext);
      logProgress(progress, `planned action not executable: ${plannedAction.action}${reason ? ` | ${reason}` : ""}`);
      return buildActionNotExecutableExit({ task, step, url: state.url, plannedAction, reason, requiresHuman });
    }

    const decision = plannedAction;
    logProgress(progress, `executing planned step ${step}/${maxSteps}`);

    const actionDesc = decision.action === "goto" ? `${decision.action} ${decision.url}` : decision.action;
    logProgress(progress, `[${step}/${maxSteps}] ${actionDesc}`);

    if (decision.reason) {
      logProgress(progress, `  └─ reason: ${decision.reason}`);
    }
    if (decision.label) {
      logProgress(progress, `  └─ label: ${decision.label}`);
    }
    if (debug) {
      process.stderr.write(`\n[agent] ===== Step ${step}/${maxSteps} =====\n`);
      process.stderr.write(`[agent] Full decision: ${JSON.stringify(decision, null, 2)}\n`);
    }

    try {
      const execRet = await executeDecision(page, decision, state, executionContext);

      const effectResult = handlePostActionEffects({
        decision,
        execRet,
        executionContext,
        progress,
        extractionFile,
        extractedCount,
        debug,
      });
      extractedCount = effectResult.extractedCount;

      appendHistory(history, {
        step,
        action: decision.action,
        reason: decision.reason,
        note: execRet.note,
        url: state.url,
      });

      if (execRet.done) {
        if (execRet.requiresHuman) {
          requiresHuman = true;
        }

        return buildCompletedExit({
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
        });
      }

      await page.waitForTimeout(300);
    } catch (err) {
      const detail = normalizeText(err.message || err);
      appendErrorHistory(history, {
        step,
        action: decision.action,
        reason: decision.reason,
        error: detail,
        url: state.url,
      });
    }
  }

  return buildMaxStepsExit({ task, history, maxSteps, lastUrl, requiresHuman });
}

module.exports = {
  runExecutionLoop,
};
