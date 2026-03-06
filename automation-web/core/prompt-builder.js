"use strict";

const { getSiteConfig } = require("./site-config");

/**
 * Build planner prompt with task context
 */
function buildPlannerPrompt(task, step, maxSteps, state, history, possibleLoginDetected, taskAnalysis) {
  const siteConfig = getSiteConfig(state.url);

  const payload = {
    task,
    step,
    max_steps: maxSteps,
    current_url: state.url,
    page_title: state.title,
    body_text: state.body_text,
    candidates: state.candidates,
    history,
  };

  const promptLines = [
    "You are controlling Playwright through one structured action at a time.",
    "Goal: finish the user task quickly and safely.",
    "You must output exactly one JSON object that matches the provided schema.",
    "",
  ];

  // Add task analysis context
  if (taskAnalysis) {
    promptLines.push(
      "=== Task Analysis ===",
      `Intent: ${taskAnalysis.intent} (search=明确搜索 | browse=漫无目的浏览)`,
      `Goal: ${taskAnalysis.goal}`,
    );
    if (taskAnalysis.intent === "search" && taskAnalysis.keywords.length > 0) {
      promptLines.push(`Keywords: ${taskAnalysis.keywords.join(", ")}`);
    }
    promptLines.push("");
  }

  // Add site configuration if available
  if (siteConfig?.selectors) {
    promptLines.push(
      "=== Site Configuration (Verified Selectors - Use These First) ===",
      JSON.stringify(siteConfig.selectors, null, 2),
      "",
      "IMPORTANT: These selectors are verified and accurate. Use them for extraction when available.",
      ""
    );
  }

  if (possibleLoginDetected) {
    promptLines.push(
      "⚠️ WARNING: Possible login/verification detected in page text.",
      "If you see a login popup/modal blocking content → use 'pause' immediately.",
      "If the page is accessible (user already logged in) → proceed normally.",
      ""
    );
  }

  promptLines.push(
    "Available Actions:",
    "- Navigation: goto, back",
    "- Interaction: click, type, press, wait",
    "- Data: extract (extract content from page)",
    "- Control: close (close modal/popup), done, fail, pause",
    "",
    "Rules:",
    "1) Use target_id from candidates when available for reliable element selection.",
    "",
    "2) Search Strategy - Use type action with press_enter parameter:",
    "   {\"action\": \"type\", \"target_id\": 5, \"text\": \"query\", \"press_enter\": true, \"reason\": \"...\"}",
    "   This submits the search in ONE step (faster and more reliable).",
    "",
    "2) Search Strategy - Use type action with press_enter parameter:",
    "   {\"action\": \"type\", \"target_id\": 5, \"text\": \"query\", \"press_enter\": true, \"reason\": \"...\"}",
    "   This submits the search in ONE step (faster and more reliable).",
    "",
    "3) Extract Action - Extract content from page:",
    "   Parameters:",
    "   - label: (required) descriptive name for this extraction",
    "   - selector: (optional) CSS selector to extract from specific element",
    "   - target_id: (optional) use candidate id instead of selector",
    "   - max_length: (optional) max characters to extract (default: 5000)",
    "   ",
    "   Examples:",
    "   {\"action\": \"extract\", \"label\": \"article_1_title\", \"target_id\": 10, \"reason\": \"Extract first article title\"}",
    "   {\"action\": \"extract\", \"label\": \"article_1_content\", \"reason\": \"Extract full article content from body\"}",
    "",
    "4) Close Action - Close modals/popups or go back:",
    "   Strategies:",
    "   - Default: Press Escape key (works for most modals)",
    "   - With selector/target_id: Click close button",
    "   - With method='back': Navigate back in history",
    "",
    "5) Loop Tasks - Handle 'return first N items' requests:",
    "   When task asks for multiple items (e.g., '前3篇文章', 'top 5 results'):",
    "   ",
    "   Pattern for each item:",
    "     1. click - Open the item",
    "     2. wait - Let content load",
    "     3. extract - Capture title (label: 'item_N_title')",
    "     4. extract - Capture content (label: 'item_N_content')",
    "     5. close - Return to list (via Escape or back)",
    "     6. wait - Let list reload",
    "   ",
    "   IMPORTANT:",
    "   - Use descriptive labels: 'article_1_title', 'article_2_content', etc.",
    "   - Always close/return after each item before opening next",
    "   - Track progress in reason field: 'Step 3/15: Extract article 1 title'",
    "   - Only use 'done' after ALL N items are extracted",
    "",
    "6) Login/Auth Detection - PAUSE for human:",
    "   If you see a login popup/modal/dialog blocking content:",
    "   → Use 'pause' action immediately",
    "   → reason: describe what login method is shown",
    "   → result: 'Login required - paused for human intervention'",
    "",
    "7) Multi-step tasks:",
    "   - Parse the task to identify ALL required steps",
    "   - Track progress in your reason field",
    "   - Only return 'done' when ALL steps are completed",
    "",
    "State JSON:",
    JSON.stringify(payload, null, 2)
  );

  return promptLines.join("\n");
}

module.exports = { buildPlannerPrompt };
