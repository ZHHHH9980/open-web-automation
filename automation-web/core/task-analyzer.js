"use strict";

const { runPlanner } = require("../planners");

/**
 * Analyze user task to understand intent and extract key information
 * @param {string} task - User task description
 * @param {object} commonSites - Map of common site keywords to domains
 * @returns {Promise<{
 *   intent: "search" | "browse",
 *   target_site: string | null,
 *   keywords: string[],
 *   goal: string,
 *   initial_url: string | null
 * }>}
 */
async function analyzeTask(task, commonSites = {}) {
  const prompt = buildAnalysisPrompt(task, commonSites);

  // Use planner without screenshot (lightweight analysis)
  const result = await runPlanner(prompt, null, null);

  if (!result.ok) {
    // Fallback to basic parsing
    process.stderr.write(`[task-analyzer] LLM analysis failed, using fallback: ${result.error}\n`);
    return fallbackAnalysis(task, commonSites);
  }

  const analysis = result.decision || {};

  // Log raw LLM response for debugging
  if (process.env.OWA_AGENT_DEBUG === "1") {
    process.stderr.write(`[task-analyzer] Raw LLM response:\n${JSON.stringify(analysis, null, 2)}\n`);
  }

  // Validate and normalize
  const normalized = {
    intent: analysis.intent === "browse" ? "browse" : "search",
    target_site: analysis.target_site || null,
    keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
    goal: analysis.goal || task,
    initial_url: analysis.initial_url || null
  };

  // Log analysis breakdown
  process.stderr.write(`[task-analyzer] Analysis breakdown:\n`);
  process.stderr.write(`  - Detected intent: ${normalized.intent}\n`);
  process.stderr.write(`  - Target site: ${normalized.target_site || "not specified"}\n`);
  if (normalized.keywords.length > 0) {
    process.stderr.write(`  - Extracted keywords: ${normalized.keywords.join(", ")}\n`);
  }
  process.stderr.write(`  - Goal: ${normalized.goal}\n`);

  return normalized;
}

/**
 * Build prompt for task analysis
 */
function buildAnalysisPrompt(task, commonSites) {
  const siteList = Object.entries(commonSites)
    .map(([keyword, domain]) => `  - ${keyword}: ${domain}`)
    .join("\n");

  return `
You are a task analyzer for web automation. Analyze the user's task and output a JSON object.

=== Task ===
${task}

=== Common Sites Reference ===
${siteList}

=== Your Job ===
Analyze the task and determine:
1. Intent: Is this a "search" (明确搜索) or "browse" (漫无目的浏览)?
   - search: User wants to search for specific content with keywords
   - browse: User wants to explore/browse without specific search terms

2. Target site: Which website should we visit? (use domain from reference if mentioned)

3. Keywords: What are the search keywords? (only for search intent)

4. Goal: What is the user trying to achieve?

=== Output Format ===
{
  "intent": "search" | "browse",
  "target_site": "xiaohongshu.com" | null,
  "keywords": ["keyword1", "keyword2"],
  "goal": "brief description of what user wants",
  "initial_url": null
}

=== Rules ===
- intent must be either "search" or "browse"
- target_site should be the domain only (e.g., "xiaohongshu.com")
- keywords should be an array of search terms (empty for browse)
- goal should be a concise summary of the task objective
- initial_url should always be null (we'll construct it based on intent)

Output JSON only, no explanation.
`.trim();
}

/**
 * Fallback analysis when LLM fails
 */
function fallbackAnalysis(task, commonSites) {
  const taskLower = task.toLowerCase();

  // Detect intent
  const searchKeywords = ["搜索", "查找", "找", "search", "find"];
  const hasSearchIntent = searchKeywords.some(kw => taskLower.includes(kw));

  // Detect target site
  let targetSite = null;
  for (const [keyword, domain] of Object.entries(commonSites)) {
    if (taskLower.includes(keyword.toLowerCase())) {
      targetSite = domain;
      break;
    }
  }

  // Extract potential keywords (improved heuristic)
  const keywords = [];
  if (hasSearchIntent) {
    // Try to extract quoted content
    const quotedMatch = task.match(/["「『]([^"」』]+)["」』]/);
    if (quotedMatch) {
      keywords.push(quotedMatch[1]);
    } else {
      // Try to extract content after "搜索" keyword
      const searchMatch = task.match(/搜索[^\s]*\s+([^\s,，。]+)/);
      if (searchMatch) {
        keywords.push(searchMatch[1]);
      }
    }
  }

  const result = {
    intent: hasSearchIntent ? "search" : "browse",
    target_site: targetSite,
    keywords,
    goal: task,
    initial_url: null
  };

  // Log fallback analysis
  process.stderr.write(`[task-analyzer] Fallback analysis:\n`);
  process.stderr.write(`  - Intent: ${result.intent}\n`);
  process.stderr.write(`  - Target site: ${result.target_site || "not detected"}\n`);
  if (result.keywords.length > 0) {
    process.stderr.write(`  - Keywords: ${result.keywords.join(", ")}\n`);
  }

  return result;
}

module.exports = {
  analyzeTask
};
