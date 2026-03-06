"use strict";

const { generatePlan } = require("./task-planner");
const { buildSearchUrl, getBrowseUrl } = require("./site-config");
const { connectBrowser, getAutomationPage } = require("./browser");
const { logProgress } = require("./utils");

/**
 * Analyze task and generate execution plan
 * @param {string} task - User task description
 * @param {number} maxSteps - Maximum steps allowed
 * @param {Object} commonSites - Common sites mapping
 * @param {boolean} progress - Enable progress logging
 * @returns {Promise<{executionPlan: Array|null, taskAnalysis: Object|null}>}
 */
async function analyzeAndPlan(task, maxSteps, commonSites, progress) {
  logProgress(progress, `task started: ${task}`);
  logProgress(progress, "analyzing task and generating execution plan...");

  const planResult = await generatePlan(task, null, maxSteps, commonSites);

  let executionPlan = null;
  let taskAnalysis = null;

  if (planResult.ok) {
    executionPlan = planResult.plan;
    taskAnalysis = planResult.analysis;

    // Display task analysis
    if (taskAnalysis) {
      logProgress(progress, "");
      logProgress(progress, "=== Task Analysis ===");
      logProgress(progress, `Intent: ${taskAnalysis.intent} (${taskAnalysis.intent === "search" ? "明确搜索" : "漫无目的浏览"})`);
      logProgress(progress, `Target Site: ${taskAnalysis.target_site || "unknown"}`);
      if (taskAnalysis.keywords && taskAnalysis.keywords.length > 0) {
        logProgress(progress, `Keywords: ${taskAnalysis.keywords.join(", ")}`);
      }
      logProgress(progress, `Goal: ${taskAnalysis.goal || task}`);
      logProgress(progress, "====================");
    }

    // Display execution plan
    logProgress(progress, "");
    logProgress(progress, "=== Execution Plan ===");
    executionPlan.forEach((step, idx) => {
      const actionDesc = step.action === "goto" ? `${step.action} ${step.url}` : step.action;
      logProgress(progress, `  ${idx + 1}. ${actionDesc}`);
      logProgress(progress, `     └─ ${step.reason}`);
    });
    logProgress(progress, "======================");
    logProgress(progress, "");
  } else {
    // Even if validation failed, try to show raw analysis and plan
    if (planResult.rawPlan?.analysis) {
      taskAnalysis = planResult.rawPlan.analysis;
      logProgress(progress, "");
      logProgress(progress, "=== Task Analysis (validation failed, showing raw) ===");
      logProgress(progress, `Intent: ${taskAnalysis.intent} (${taskAnalysis.intent === "search" ? "明确搜索" : "漫无目的浏览"})`);
      logProgress(progress, `Target Site: ${taskAnalysis.target_site || "unknown"}`);
      if (taskAnalysis.keywords && taskAnalysis.keywords.length > 0) {
        logProgress(progress, `Keywords: ${taskAnalysis.keywords.join(", ")}`);
      }
      logProgress(progress, `Goal: ${taskAnalysis.goal || task}`);
      logProgress(progress, "======================================================");
    }

    if (planResult.rawPlan?.plan && Array.isArray(planResult.rawPlan.plan)) {
      logProgress(progress, "");
      logProgress(progress, "=== Execution Plan (validation failed, showing raw) ===");
      planResult.rawPlan.plan.forEach((step, idx) => {
        const actionDesc = step.action === "goto" ? `${step.action} ${step.url}` : step.action;
        logProgress(progress, `  ${idx + 1}. ${actionDesc}`);
        logProgress(progress, `     └─ ${step.reason || "no reason"}`);
      });
      logProgress(progress, "========================================================");
      logProgress(progress, "");
    }
    logProgress(progress, `plan generation failed: ${planResult.error}`);
    logProgress(progress, "");
  }

  return { executionPlan, taskAnalysis };
}

/**
 * Determine initial URL from task analysis
 * @param {Object|null} taskAnalysis - Task analysis result
 * @param {boolean} progress - Enable progress logging
 * @returns {{ok: boolean, url?: string, error?: string}} Initial URL result
 */
function determineInitialUrl(taskAnalysis, progress) {
  if (!taskAnalysis) {
    return { ok: false, error: "planner did not return task analysis" };
  }

  const domain = taskAnalysis.target_site;
  if (!domain) {
    return { ok: false, error: "planner did not identify target_site" };
  }

  let initialUrl;
  if (taskAnalysis.intent === "search" && taskAnalysis.keywords && taskAnalysis.keywords.length > 0) {
    initialUrl = buildSearchUrl(domain, taskAnalysis.keywords);
    if (!initialUrl) {
      initialUrl = getBrowseUrl(domain);
      logProgress(progress, "site doesn't support URL search, using browse URL");
    }
  } else {
    initialUrl = getBrowseUrl(domain);
  }

  logProgress(progress, `Initial URL: ${initialUrl}`);
  logProgress(progress, "");

  return { ok: true, url: initialUrl };
}

/**
 * Initialize browser and navigate to initial URL
 * @param {string} cdpUrl - CDP URL
 * @param {string} initialUrl - Initial URL to navigate
 * @param {boolean} progress - Enable progress logging
 * @returns {Promise<{browser: Object, page: Object}>}
 */
async function initializeBrowser(cdpUrl, initialUrl, progress) {
  logProgress(progress, "opening browser...");
  const conn = await connectBrowser(cdpUrl);
  const browser = conn.browser;
  const page = await getAutomationPage(conn.context);
  page.setDefaultTimeout(12000);

  logProgress(progress, `navigating to ${initialUrl}...`);
  await page.goto(initialUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1000);

  return { browser, page };
}

module.exports = {
  analyzeAndPlan,
  determineInitialUrl,
  initializeBrowser,
};
