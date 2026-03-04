"use strict";

function buildExecutionPrompt(task, step, maxSteps, state, history, rules, agentPlan) {
  const payload = {
    task,
    step,
    max_steps: maxSteps,
    current_url: state.url,
    page_title: state.title,
    body_text: state.body_text,
    candidates: state.candidates,
    history,
    recent_corrections: rules,
    plan: agentPlan,
  };

  return [
    "You are controlling Playwright through one structured action at a time.",
    "Goal: finish the user task quickly and safely.",
    "You must output exactly one JSON object that matches the provided schema.",
    "",
    "PLAN (from task analysis):",
    `hard_filters: ${JSON.stringify(agentPlan.hard_filters)}`,
    `preferences: ${JSON.stringify(agentPlan.preferences)}`,
    `steps: ${JSON.stringify(agentPlan.steps)}`,
    "",
    "CRITICAL: NEVER choose an item that violates a hard_filter.",
    "",
    "Rules:",
    "1) Vision-First: use coordinates for content items, target_id for UI controls.",
    "2) Click content: {\"action\":\"click\",\"x\":350,\"y\":420,\"reason\":\"...\"}",
    "3) Login detected → use 'pause' immediately.",
    "4) Judge navigation success by CONTENT in screenshot, not URL.",
    "5) After type → press Enter. No manual 'wait' after click/press.",
    "6) Scroll rules:",
    "   - ONLY scroll if target content is NOT visible in screenshot",
    "   - Check screenshot first: can you see what you need? If yes, DON'T scroll",
    "   - scroll_px: positive = down, negative = up",
    "   - Example: {\"action\":\"scroll\",\"scroll_px\":900} scrolls DOWN",
    "   - Example: {\"action\":\"scroll\",\"scroll_px\":-900} scrolls UP",
    "   - After page load (search, navigation), content is usually visible - don't scroll immediately",
    "7) Only return 'done' when ALL plan steps are completed.",
    "8) Use 'fail' for technical errors, 'pause' for login/auth.",
    "",
    "State JSON:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

module.exports = {
  buildExecutionPrompt,
};
