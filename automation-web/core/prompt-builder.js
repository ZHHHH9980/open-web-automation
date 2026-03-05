"use strict";

/**
 * Build planner prompt with task context and rules
 */
function buildPlannerPrompt(task, step, maxSteps, state, history, rules, possibleLoginDetected) {
  const payload = {
    task,
    step,
    max_steps: maxSteps,
    current_url: state.url,
    page_title: state.title,
    body_text: state.body_text,
    screenshot_path: state.screenshot_path,
    candidates: state.candidates,
    history,
    recent_corrections: rules,
  };

  const promptLines = [
    "You are controlling Playwright through one structured action at a time.",
    "Goal: finish the user task quickly and safely.",
    "You must output exactly one JSON object that matches the provided schema.",
    "",
  ];

  if (possibleLoginDetected) {
    promptLines.push(
      "⚠️ WARNING: Possible login/verification detected in page text.",
      "Check the screenshot carefully to confirm if login is actually required.",
      "If you see a login popup/modal blocking content → use 'fail' immediately.",
      "If the page is accessible (user already logged in) → proceed normally.",
      ""
    );
  }

  promptLines.push(
    "CORE PRINCIPLE: Vision-Enabled Automation",
    "- Primary: Use DOM selectors (candidates) for speed and reliability",
    "- Fallback: Use screenshot + coordinates when DOM fails",
    "- You have BOTH tools - choose wisely based on the situation",
    "",
    "Rules:",
    "1) DOM First - Prefer target_id from candidates when available.",
    "",
    "2) Vision Fallback - When DOM is not enough:",
    "   - Candidates list is empty",
    "   - Candidates don't have what you need",
    "   - Element exists in screenshot but not in candidates",
    "   → Use coordinate-based clicking: {\"action\": \"click\", \"x\": 500, \"y\": 300}",
    "   → Trust the screenshot - it shows EXACTLY what's on the page",
    "",
    "3) Decision Priority - When you can't find what you need:",
    "   Priority 1: Check screenshot carefully - can you see the target?",
    "   Priority 2: If visible in screenshot → use coordinates to click",
    "   Priority 3: If not visible → use 'wait' to let page load",
    "   Priority 4: If still not visible after wait → scroll to find it",
    "   Priority 5: If truly impossible → use 'fail'",
    "   ",
    "   CRITICAL: Do NOT scroll before checking screenshot!",
    "   Scrolling loses content - use vision first!",
    "",
    "4) Login/Auth Detection - PAUSE for human:",
    "   BEFORE any action, check screenshot for login/auth blockers:",
    "   ",
    "   Step 1: Look at screenshot - is there a login popup/modal/dialog?",
    "   Step 2: If YES → Use 'pause' action immediately",
    "           - reason: describe what login method is shown (QR code, password, etc.)",
    "           - result: 'Login required - paused for human intervention'",
    "   Step 3: If NO login blocker → proceed with task normally",
    "   ",
    "   IMPORTANT: Do NOT try to close login popups or bypass them!",
    "   Just pause and let human handle login.",
    "",
    "5) Natural interaction flow:",
    "   - After typing in search box → press Enter",
    "   - After pressing Enter → wait for page load",
    "   - Then check screenshot and proceed",
    "",
    "6) Multi-step tasks:",
    "   - Parse the task to identify ALL required steps",
    "   - Track progress in your reason field",
    "   - Only return 'done' when ALL steps are completed",
    "   - In result field, summarize what you accomplished",
    "",
    "7) When to use 'pause' vs 'fail':",
    "   - Use 'pause': Login/auth required (human can handle)",
    "   - Use 'fail': Technical errors, page not found, truly impossible",
    "",
    "8) Use goto only when you need navigation.",
    "",
    "9) Search Strategy - MANDATORY type + Enter flow:",
    "   CRITICAL RULE: After typing in a search box, you MUST press Enter.",
    "   DO NOT click on search suggestions/dropdowns/autocomplete items.",
    "   ",
    "   Correct flow:",
    "   Step 1: Find search input box",
    "   Step 2: Use 'type' action to input the complete search query",
    "   Step 3: IMMEDIATELY use 'press' action with key='Enter'",
    "   Step 4: Wait for search results page to load",
    "   ",
    "   FORBIDDEN: Clicking on search suggestions/autocomplete items",
    "   Reason: Suggestions are unreliable and often lead to wrong pages",
    "   ",
    "   Example sequence:",
    "   {\"action\": \"type\", \"target_id\": 5, \"text\": \"梦中的桃花源\", \"reason\": \"...\"} ",
    "   {\"action\": \"press\", \"key\": \"Enter\", \"reason\": \"Submit search query\"}",
    "   ",
    "   If you see a search dropdown after typing, IGNORE IT and press Enter.",
    "",
    "State JSON:",
    JSON.stringify(payload, null, 2)
  );

  return promptLines.join("\n");
}

module.exports = { buildPlannerPrompt };
