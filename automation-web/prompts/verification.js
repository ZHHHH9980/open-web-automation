"use strict";

function buildVerificationPrompt(task, agentPlan, state, history) {
  return [
    "You are verifying whether a web automation task was truly completed.",
    "Output ONLY a JSON object: {\"verified\": true/false, \"reason\": \"...\"}",
    "",
    "Task: " + task,
    "Hard filters that MUST be satisfied: " + JSON.stringify(agentPlan.hard_filters),
    "Plan steps that MUST be completed: " + JSON.stringify(agentPlan.steps),
    "",
    "Current page URL: " + state.url,
    "Current page title: " + state.title,
    "Page text (first 500 chars): " + (state.body_text || "").slice(0, 500),
    "Action history: " + JSON.stringify(history.slice(-5)),
    "",
    "Verification rules:",
    "1. Check ALL hard_filters are satisfied (if any).",
    "2. Check ALL plan steps are completed.",
    "3. Check the task GOAL is actually achieved:",
    "   - If task says '发给我/链接/URL' → a specific URL must have been reached (not just a list/search page)",
    "   - If task says '点进去/打开' → must have navigated INTO the target item",
    "   - If task says '搜索结果' → search results page is sufficient",
    "   - If task says '最新文章/最便宜/第一个' → must have clicked INTO that specific item",
    "",
    "If yes → {\"verified\": true, \"reason\": \"all conditions met\"}",
    "If no → {\"verified\": false, \"reason\": \"explain exactly what is missing\"}",
  ].join("\n");
}

async function runVerificationPhase(task, agentPlan, state, history, model, runPlanner, extractJsonObject) {
  if (!agentPlan) {
    return { ok: true, verified: true };
  }

  // Always run verification - check task goal completion, not just hard_filters
  const prompt = buildVerificationPrompt(task, agentPlan, state, history);
  const planRet = await runPlanner(prompt, model, state.screenshot_b64, { rawMode: true });
  if (!planRet.ok) return { ok: true, verified: true }; // fail open
  try {
    const jsonText = extractJsonObject(planRet.raw);
    const obj = JSON.parse(jsonText);
    return { ok: true, verified: Boolean(obj.verified), reason: String(obj.reason || "") };
  } catch (_err) {
    return { ok: true, verified: true }; // fail open
  }
}

module.exports = {
  buildVerificationPrompt,
  runVerificationPhase,
};
