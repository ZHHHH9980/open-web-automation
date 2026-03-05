"use strict";

const { runPlanner } = require("../planners");

/**
 * Generate a complete execution plan for the task
 * @param {string} task - User task description
 * @param {object} state - Current page state
 * @param {number} maxSteps - Maximum steps allowed
 * @returns {Promise<{ok: boolean, plan?: Array, error?: string}>}
 */
async function generatePlan(task, state, maxSteps = 15) {
  const prompt = buildPlanningPrompt(task, state, maxSteps);

  // Use planner to generate plan
  const result = await runPlanner(prompt, null, state.screenshot_b64);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Validate plan structure
  const plan = result.decision?.plan || [];
  if (!Array.isArray(plan) || plan.length === 0) {
    return { ok: false, error: "Invalid plan structure" };
  }

  return { ok: true, plan };
}

/**
 * Build prompt for planning mode
 */
function buildPlanningPrompt(task, state, maxSteps) {
  const payload = {
    task,
    max_steps: maxSteps,
    current_url: state.url,
    page_title: state.title,
    body_text: state.body_text,
    candidates: state.candidates,
    site_hints: state.site_hints || {},
  };

  const promptLines = [
    "You are a web automation planner. Your job is to analyze the task and generate a complete execution plan.",
    "",
    "IMPORTANT: You must output a JSON object with a 'plan' array containing ALL steps needed.",
    "",
    "Available actions: goto, click, type, press, scroll, wait, back, done, fail, pause",
    "",
    "Task Analysis Guidelines:",
    "1. Break down the task into atomic steps",
    "2. Consider the current page state",
    "3. Plan for navigation, interaction, and data extraction",
    "4. Include 'done' as the final step",
    "",
    "Output Format:",
    "{",
    '  "plan": [',
    '    {"step": 1, "action": "goto", "url": "...", "reason": "..."},',
    '    {"step": 2, "action": "type", "target_id": 5, "text": "...", "reason": "..."},',
    '    {"step": 3, "action": "scroll", "scroll_px": 900, "reason": "..."},',
    '    {"step": 4, "action": "done", "result": "...", "reason": "..."}',
    "  ]",
    "}",
    "",
    "Rules:",
    "- Each step must have: step (number), action (string), reason (string)",
    "- Include all necessary parameters for each action",
    "- The 'type' action automatically presses Enter",
    "- Use 'back' to return to previous page",
    "- Final step must be 'done' with result summary",
    "",
    "Current State:",
    JSON.stringify(payload, null, 2),
  ];

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
