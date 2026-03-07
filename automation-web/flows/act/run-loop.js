"use strict";

const { collectPageState } = require("./state-collector");
const { executeDecision } = require("./executor");
const { canExecutePlan, explainCannotExecutePlan } = require("../plan/task-planner");
const { finalizeCompletedTask, buildTimeoutResult, buildPlanExhaustedResult, buildActionNotExecutableResult, buildHumanPauseResult, buildMaxStepsResult } = require("../finish/finalize-task");
const { normalizeText, logProgress } = require("../../shared/utils");
const { data: dataHandler, listen: listenHandler } = require("./actions");

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
      return {
        result: buildTimeoutResult({ task, history, timeoutMs, lastUrl }),
        requiresHuman,
      };
    }

    const state = await collectPageState(page, step, 0, executionContext.currentApiCollector);
    lastUrl = state.url || lastUrl;

    if (state.human_block) {
      requiresHuman = true;
      logProgress(progress, `human intervention required: ${state.human_block.reason}`);
      return {
        result: buildHumanPauseResult({
          task,
          step,
          url: state.url,
          reason: state.human_block.reason,
          block: state.human_block,
        }),
        requiresHuman,
      };
    }

    logProgress(progress, `step ${step}/${maxSteps} url=${state.url || "about:blank"} planning...`);

    if (!executionPlan || executionPlan.length === 0) {
      return {
        result: buildPlanExhaustedResult({ task, step, url: state.url }),
        requiresHuman,
      };
    }

    const plannedAction = executionPlan.shift();
    if (!canExecutePlan(plannedAction, state, executionContext)) {
      const reason = explainCannotExecutePlan(plannedAction, state, executionContext);
      logProgress(progress, `planned action not executable: ${plannedAction.action}${reason ? ` | ${reason}` : ""}`);
      return {
        result: buildActionNotExecutableResult({ task, step, url: state.url, plannedAction, reason }),
        requiresHuman,
      };
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

      if (decision.action === "listen" && execRet.apiCollector) {
        listenHandler.handleApiListener(executionContext, execRet.apiCollector, progress);
      }

      if (["scrape_list", "scrape_detail"].includes(decision.action) && execRet.data) {
        extractedCount += 1;
        dataHandler.storeCapturedData(extractionFile, extractedCount, decision.action, execRet.data, debug);
        if (decision.action === "scrape_list") {
          executionContext.lastListCapture = execRet.data;
        }
      }

      history.push({
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

      await page.waitForTimeout(300);
    } catch (err) {
      const detail = normalizeText(err.message || err);
      history.push({
        step,
        action: decision.action,
        reason: decision.reason,
        error: detail,
        url: state.url,
      });
    }
  }

  return {
    result: buildMaxStepsResult({ task, history, maxSteps, lastUrl }),
    requiresHuman,
  };
}

module.exports = {
  runExecutionLoop,
};
