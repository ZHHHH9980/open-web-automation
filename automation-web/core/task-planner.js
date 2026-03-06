"use strict";

const { runPlanner } = require("../planners");
const { SITE_CONFIG } = require("./site-config");
const {
  buildActionCatalogLines,
  buildPlannerActionReference,
  getActionDefinition,
} = require("./actions/registry");

async function generatePlan(task, state, maxSteps = 15, commonSites = {}) {
  const prompt = buildPlanningPrompt(task, state, maxSteps, commonSites);
  const result = await runPlanner(prompt, null, null);

  if (!result.ok) {
    return { ok: false, error: result.error, rawPlan: result.decision || null };
  }

  const analysis = result.decision?.analysis || null;
  const plan = result.decision?.plan || [];
  if (!Array.isArray(plan) || plan.length === 0) {
    return { ok: false, error: "Invalid plan structure", rawPlan: result.decision };
  }

  return { ok: true, analysis, plan, rawPlan: result.decision };
}

function toYesNo(value) {
  return value ? "yes" : "no";
}

function buildSitePlanningReferenceLines() {
  const entries = Object.entries(SITE_CONFIG)
    .filter(([, config]) => config.planning || config.api?.list || config.api?.detail)
    .flatMap(([domain, config]) => {
      const preferredFlow = config.planning?.preferred_flow || "unspecified";
      const detailOpenMode = config.planning?.detail_open_mode || "unspecified";
      const contentFromList = Boolean(config.planning?.content_from_list);
      const summary = config.planning?.summary || "No special planning guidance configured.";
      return [
        `- ${domain} | search=${toYesNo(Boolean(config.urls?.search || config.search_url))} | list_api=${toYesNo(Boolean(config.api?.list))} | detail_api=${toYesNo(Boolean(config.api?.detail))} | flow=${preferredFlow} | detail_open_mode=${detailOpenMode} | content_from_list=${toYesNo(contentFromList)}`,
        `  Notes: ${summary}`,
      ];
    });

  if (entries.length === 0) {
    return ["- No sites currently expose planning guidance or configured API endpoints."];
  }

  return entries;
}

function buildPlanningPrompt(task, state, maxSteps, commonSites = {}) {
  const siteList = Object.entries(commonSites)
    .map(([keyword, domain]) => `  - ${keyword}: ${domain}`)
    .join("\n");
  const hasPageState = state && state.url;

  const promptLines = [
    "You are a web automation planner. Analyze the task and generate a complete execution plan.",
    "",
    "=== STEP 1: Task Analysis ===",
    "First, understand what the user wants:",
    "- Intent: search (明确搜索) or browse (漫无目的浏览)?",
    "- Target site: Which website? (use domain from reference if mentioned)",
    "- Keywords: What search terms? (only for search intent)",
    "- Goal: What is the user trying to achieve?",
    "",
    "Common Sites Reference:",
    siteList,
    "",
    "Site Planning Reference:",
    ...buildSitePlanningReferenceLines(),
    "",
    "=== STEP 2: Execution Plan ===",
    "Then, break down into atomic actions:",
    "",
    "Available actions:",
    ...buildActionCatalogLines(),
    "",
    ...buildPlannerActionReference(),
    "",
  ];

  if (hasPageState) {
    promptLines.push(
      "Current Page State:",
      `URL: ${state.url}`,
      `Title: ${state.title}`,
      `Captured API Responses: ${state.api_responses?.length || 0}`,
      ""
    );
  } else {
    promptLines.push(
      "Note: Browser not yet opened. Generate plan based on task description only.",
      "Prefer API-first actions, but you may use click with target_id when the site planning reference says detail_open_mode=click_result_item.",
      ""
    );
  }

  promptLines.push(
    "=== Output Format ===",
    "{",
    '  "analysis": {',
    '    "intent": "search" | "browse",',
    '    "target_site": "xiaohongshu.com" | null,',
    '    "keywords": ["keyword1"],',
    '    "goal": "brief description"',
    "  },",
    '  "plan": [',
    '    {"step": 1, "action": "listen", "reason": "Start API monitoring before navigation"},',
    '    {"step": 2, "action": "goto", "url": "https://...", "reason": "Navigate to the target page"},',
    '    {"step": 3, "action": "scrape_list", "max_items": 3, "reason": "Extract the first 3 items from the configured list API"},',
    '    {"step": 4, "action": "click", "target_id": 1, "reason": "Open the first result when the site requires click_result_item for detail pages"},',
    '    {"step": 5, "action": "scrape_detail", "reason": "Capture detail data from the configured detail API if it was triggered"},',
    '    {"step": 6, "action": "done", "result": "...", "reason": "Task complete"}',
    "  ]",
    "}",
    "",
    "Rules:",
    "- analysis.intent must be 'search' or 'browse'",
    "- analysis.target_site should be domain only (e.g., 'xiaohongshu.com')",
    "- Each plan step must have: step, action, reason",
    "- Include all necessary parameters for each action",
    "- Only use the actions listed above; do not invent new action names",
    "- Do not use selector, x, or y in plans unless the current page state explicitly requires them",
    "- You may use click with target_id when detail_open_mode=click_result_item; target_id means the 1-based result rank to open",
    "- If flow=list_only and content_from_list=yes, prefer listen -> goto -> scrape_list -> done for title/content retrieval tasks",
    "- If flow=list_then_detail and content_from_list=no, use scrape_list for discovery, then open detail pages and use scrape_detail for content retrieval tasks",
    "- If detail_open_mode=click_result_item, prefer click target_id=1/2/3 after scrape_list and do not use goto with {{item_n_url}} placeholders for that site",
    "- If detail_open_mode=goto_item_url, goto with {{item_n_url}} placeholders is allowed after scrape_list succeeds",
    "- Only use scrape_list on sites that explicitly define api.list in site-config",
    "- Only use scrape_detail on sites that explicitly define api.detail in site-config",
    "- Prefer direct search URL navigation when the site supports search and the task includes explicit keywords",
    "- Final step must be 'done' with result summary",
    ""
  );

  if (hasPageState) {
    promptLines.push(
      "Page Content:",
      JSON.stringify({
        task,
        max_steps: maxSteps,
        current_url: state.url,
        page_title: state.title,
        api_responses_count: state.api_responses?.length || 0,
      }, null, 2)
    );
  } else {
    promptLines.push(
      "Task:",
      JSON.stringify({ task, max_steps: maxSteps }, null, 2)
    );
  }

  return promptLines.join("\n");
}

function canExecutePlan(plannedAction, state, context = {}) {
  const definition = getActionDefinition(plannedAction?.action);
  if (!definition || typeof definition.canExecute !== "function") {
    return false;
  }

  return definition.canExecute(plannedAction, state, context);
}

module.exports = {
  generatePlan,
  canExecutePlan,
};
