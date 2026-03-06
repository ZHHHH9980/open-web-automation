"use strict";

const core = require("./core");
const { markHumanPauseTab } = core.browser;
const { toResult } = core.result;
const { collectPageState, startApiCollection } = core.stateCollector;
const { executeDecision } = core.executor;
const { canExecutePlan } = core.taskPlanner;
const { COMMON_SITES } = core.siteConfig;
const { analyzeAndPlan, determineInitialUrl, initializeBrowser } = core.taskInitializer;
const { generateTaskId, getExtractionFilePath, normalizeText, toInt, logProgress } = core.utils;
const { data: dataHandler, listen: listenHandler } = core.actions;

async function runAgentTask(rawTask, opts = {}) {
  const task = normalizeText(rawTask);
  if (!task) {
    return toResult({
      success: false,
      exit_code: 2,
      message: "task is empty",
      meta: { requires_human: false, url: "" },
    });
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
  let lastUrl = "";
  const history = [];
  const taskId = generateTaskId(); // Unique ID for this task
  const extractionFile = getExtractionFilePath(taskId); // File to store extracted content
  let extractedCount = 0; // Counter for extracted items
  let requiresHuman = false;

  // Context for executeDecision (includes API collection support)
  const executionContext = {
    startApiCollection,
    apiCollectors: [],
    currentApiCollector: null
  };

  try {
    // ===== Step 1: Analyze task and generate execution plan (BEFORE opening browser) =====
    let { executionPlan, taskAnalysis } = await analyzeAndPlan(task, maxSteps, COMMON_SITES, progress);

    // If plan generation failed, return error
    if (!executionPlan) {
      return toResult({
        success: false,
        exit_code: 4,
        message: "plan generation failed",
        meta: { requires_human: false, task },
      });
    }

    // ===== Step 2: Determine initial URL from task analysis =====
    const initialUrlResult = determineInitialUrl(taskAnalysis, progress);
    if (!initialUrlResult.ok) {
      return toResult({
        success: false,
        exit_code: 4,
        message: `initial URL resolution failed: ${initialUrlResult.error}`,
        meta: { requires_human: false, task },
      });
    }
    const initialUrl = initialUrlResult.url;

    // ===== Step 3: Now open browser and navigate =====
    const browserInit = await initializeBrowser(cdpUrl, initialUrl, progress);
    browser = browserInit.browser;
    page = browserInit.page;

    for (let step = 1; step <= maxSteps; step += 1) {
      if (Date.now() - startedAt > timeoutMs) {
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

      const state = await collectPageState(page, step, 0, executionContext.currentApiCollector);
      lastUrl = state.url || lastUrl;

      logProgress(progress, `step ${step}/${maxSteps} url=${state.url || "about:blank"} planning...`);

      // Get next planned action
      if (!executionPlan || executionPlan.length === 0) {
        return toResult({
          success: false,
          exit_code: 4,
          message: "execution plan exhausted before task completion",
          meta: { requires_human: false, task, step, url: state.url },
        });
      }

      const plannedAction = executionPlan.shift();

      if (!canExecutePlan(plannedAction, state)) {
        return toResult({
          success: false,
          exit_code: 4,
          message: `planned action not executable: ${plannedAction.action}`,
          meta: { requires_human: false, task, step, url: state.url, planned_action: plannedAction },
        });
      }

      const decision = plannedAction;
      logProgress(progress, `executing planned step ${step}/${maxSteps}`);

      // Always show agent's reasoning (not just in debug mode)
      const actionDesc = decision.action === "goto" ? `${decision.action} ${decision.url}` :
                        decision.action;

      logProgress(progress, `[${step}/${maxSteps}] ${actionDesc}`);

      // Show reasoning chain
      if (decision.reason) {
        logProgress(progress, `  └─ reason: ${decision.reason}`);
      }

      // Show key parameters
      if (decision.label) {
        logProgress(progress, `  └─ label: ${decision.label}`);
      }

      // Debug mode: even more detailed info
      if (debug) {
        process.stderr.write(`\n[agent] ===== Step ${step}/${maxSteps} =====\n`);
        process.stderr.write(`[agent] Full decision: ${JSON.stringify(decision, null, 2)}\n`);
      }

      try {
        const execRet = await executeDecision(page, decision, state, executionContext);

        // If listen action was executed, store the collector
        if (decision.action === "listen" && execRet.apiCollector) {
          listenHandler.handleApiListener(executionContext, execRet.apiCollector, progress);
        }

        // Store captured API data to file
        if (["scrape_list", "scrape_detail"].includes(decision.action) && execRet.data) {
          extractedCount++;
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

        // Check if task is done BEFORE loop detection
        if (execRet.done) {
          if (execRet.requiresHuman) {
            requiresHuman = true;
          }
          const finalUrl = page.url();

          // Generate conclusion if we have extracted data
          const conclusion = await dataHandler.generateFinalConclusion(
            extractionFile,
            extractedCount,
            task,
            model,
            opts,
            progress
          );

          // Extract DOM data if requested
          const extractDom = process.env.OWA_EXTRACT_DOM === "1" || opts.extractDom;
          const domData = await dataHandler.extractDomData(page, extractDom, progress);

          return toResult({
            success: execRet.success,
            exit_code: execRet.success ? 0 : (execRet.requiresHuman ? 2 : 1),
            message: execRet.result,
            meta: {
              requires_human: execRet.requiresHuman || false,
              task,
              steps: history,
              data: execRet.data || {},
              extracted_count: extractedCount,
              extraction_file: extractedCount > 0 ? extractionFile : null,
              conclusion,
              url: finalUrl,
              dom_data: extractDom ? domData : undefined,
            },
          });
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

    return toResult({
      success: false,
      exit_code: 124,
      message: `max steps reached (${maxSteps})`,
      meta: {
        requires_human: false,
        task,
        steps: history,
        url: lastUrl,
      },
    });
  } catch (err) {
    return toResult({
      success: false,
      exit_code: 1,
      message: `agent failed: ${normalizeText(err.message || err)}`,
      meta: {
        requires_human: false,
        task,
        steps: history,
        error: String(err),
        url: lastUrl,
      },
    });
  } finally {
    if (page) {
      if (keepOpen) {
        // keep current tab untouched
      } else if (keepOpenOnHuman && requiresHuman) {
        try {
          await markHumanPauseTab(page);
        } catch (_err) {
          // ignore
        }
      } else {
        try {
          await page.close();
        } catch (_err) {
          // ignore
        }
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch (_err) {
        // ignore
      }
    }
  }
}

module.exports = {
  runAgentTask,
};
