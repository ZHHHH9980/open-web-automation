"use strict";

const { runPlanner } = require("../planners");

/**
 * Generate a complete execution plan for the task
 * Now includes task analysis in the same LLM call
 * Can work without page state (before opening browser)
 * @param {string} task - User task description
 * @param {object|null} state - Current page state (null if before opening browser)
 * @param {number} maxSteps - Maximum steps allowed
 * @param {object} commonSites - Map of common site keywords to domains
 * @returns {Promise<{ok: boolean, analysis?: object, plan?: Array, error?: string}>}
 */
async function generatePlan(task, state, maxSteps = 15, commonSites = {}) {
  const prompt = buildPlanningPrompt(task, state, maxSteps, commonSites);

  // Use planner to generate analysis + plan (no screenshot if state is null)
  const result = await runPlanner(prompt, null, state?.screenshot_b64 || null);

  if (!result.ok) {
    // Even if planner failed, try to return the decision if available
    return { ok: false, error: result.error, rawPlan: result.decision || null };
  }

  // Extract analysis and plan
  const analysis = result.decision?.analysis || null;
  const plan = result.decision?.plan || [];

  // Validate plan structure
  if (!Array.isArray(plan) || plan.length === 0) {
    return { ok: false, error: "Invalid plan structure", rawPlan: result.decision };
  }

  return { ok: true, analysis, plan, rawPlan: result.decision };
}

/**
 * Build prompt for planning mode
 * Now includes task analysis + execution plan in one LLM call
 * Works with or without page state
 */
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
    "=== STEP 2: Execution Plan ===",
    "Then, break down into atomic actions:",
    "",
    "Available actions:",
    "- Navigation: goto, back",
    "- Interaction: click, type, press, wait",
    "- Data: extract (single item), collect (list items)",
    "- Control: close (close modal/popup), done, fail, pause",
    "",
    "Action Guidelines:",
    "1. For goto: specify full URL",
    "2. For search: use type with press_enter parameter",
    "3. For extraction: use extract action with descriptive label",
    "4. For list tasks (e.g., 'first 3 articles', 'top 5 results'):",
    "   - Use collect to get all list items as JSON",
    "   - Specify max_items parameter (e.g., max_items: 3)",
    "   - Then click each item based on collected data",
    "   - Extract content from detail pages",
    "   Pattern: collect → click item 1 → extract → back → click item 2 → extract → back → ...",
    "5. Use placeholder target_id (will be filled during execution)",
    "6. Final step must be 'done'",
    "",
  ];

  if (hasPageState) {
    promptLines.push(
      "Current Page State:",
      `URL: ${state.url}`,
      `Title: ${state.title}`,
      `Candidates: ${state.candidates?.length || 0} interactive elements`,
      ""
    );
  } else {
    promptLines.push(
      "Note: Browser not yet opened. Generate plan based on task description only.",
      "Use generic actions without specific target_id (will be determined during execution).",
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
    '    {"step": 1, "action": "goto", "url": "https://...", "reason": "..."},',
    '    {"step": 2, "action": "type", "text": "...", "press_enter": true, "reason": "..."},',
    '    {"step": 3, "action": "collect", "max_items": 3, "reason": "collect first 3 items from list"},',
    '    {"step": 4, "action": "click", "reason": "click first article from collected list"},',
    '    {"step": 5, "action": "extract", "label": "article_1_content", "reason": "..."},',
    '    {"step": 6, "action": "back", "reason": "return to list"},',
    '    {"step": 7, "action": "done", "result": "...", "reason": "..."}',
    "  ]",
    "}",
    "",
    "Rules:",
    "- analysis.intent must be 'search' or 'browse'",
    "- analysis.target_site should be domain only (e.g., 'xiaohongshu.com')",
    "- Each plan step must have: step, action, reason",
    "- Include all necessary parameters for each action",
    "- NO scroll action (use selectors to extract content directly)",
    "- For list tasks: use collect with max_items, then click/extract each item",
    "- For click/type actions without page state, omit target_id (will be added during execution)",
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
        body_text: state.body_text?.slice(0, 2000) || "",
        candidates: state.candidates,
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

/**
 * Validate if a planned action can be executed in current state
 */
function canExecutePlan(plannedAction, state) {
  const action = plannedAction.action;

  // goto always executable
  if (action === "goto") return true;

  // done/fail/pause always executable
  if (["done", "fail", "pause"].includes(action)) return true;

  // scroll/wait/press always executable
  if (["scroll", "wait", "press", "back"].includes(action)) return true;

  // click/type need valid selector or coordinates
  if (action === "click" || action === "type") {
    // Has coordinates
    if (plannedAction.x != null && plannedAction.y != null) return true;

    // Has direct selector
    if (plannedAction.selector) return true;

    // Has target_id - check if it exists in candidates
    if (plannedAction.target_id) {
      const candidate = state.candidates?.find(c => c.id === plannedAction.target_id);
      return !!candidate;
    }

    return false;
  }

  return true;
}

/**
 * Replan remaining steps when execution fails
 */
async function replan(task, state, executedSteps, remainingSteps) {
  const prompt = buildReplanningPrompt(task, state, executedSteps, remainingSteps);

  const result = await runPlanner(prompt, null, state.screenshot_b64);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const plan = result.decision?.plan || [];
  return { ok: true, plan };
}

/**
 * Build prompt for replanning
 */
function buildReplanningPrompt(task, state, executedSteps, remainingSteps) {
  const payload = {
    task,
    current_url: state.url,
    page_title: state.title,
    body_text: state.body_text,
    candidates: state.candidates,
    executed_steps: executedSteps,
    remaining_steps: remainingSteps,
  };

  const promptLines = [
    "The original plan encountered an issue. You need to replan the remaining steps.",
    "",
    "Original task: " + task,
    "",
    "Steps executed so far:",
    JSON.stringify(executedSteps, null, 2),
    "",
    "Steps that couldn't be executed:",
    JSON.stringify(remainingSteps, null, 2),
    "",
    "Current page state:",
    JSON.stringify({
      url: state.url,
      title: state.title,
      candidates: state.candidates,
    }, null, 2),
    "",
    "Generate a NEW plan to complete the task from the current state.",
    "Output format: {\"plan\": [{step, action, reason, ...params}]}",
  ];

  return promptLines.join("\n");
}

module.exports = {
  generatePlan,
  canExecutePlan,
  replan,
};
