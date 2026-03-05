"use strict";

const { runClaudePlanner } = require("./claude");
const { runApiPlanner } = require("./openai");
const { runCodexPlanner } = require("./codex");

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/**
 * Run planner with automatic backend selection
 */
async function runPlanner(prompt, model, screenshotB64) {
  const backend = String(process.env.OWA_AGENT_BACKEND || "auto").toLowerCase();
  const timeoutMs = Math.max(5000, toInt(process.env.OWA_AGENT_PLAN_TIMEOUT_MS, 60000));

  if (backend === "claude" || backend === "anthropic") {
    return runClaudePlanner(prompt, model, timeoutMs, screenshotB64);
  }
  if (backend === "api" || backend === "openai") {
    return runApiPlanner(prompt, model, timeoutMs, screenshotB64);
  }
  if (backend === "codex" || backend === "codex-cli") {
    return runCodexPlanner(prompt, model);
  }

  const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (hasClaudeKey) {
    const claudeRet = await runClaudePlanner(prompt, model, timeoutMs, screenshotB64);
    if (claudeRet.ok) return claudeRet;
  }

  const hasApiKey = Boolean(process.env.OWA_AGENT_API_KEY || process.env.OPENAI_API_KEY);
  if (hasApiKey) {
    const apiRet = await runApiPlanner(prompt, model, timeoutMs, screenshotB64);
    if (apiRet.ok) return apiRet;
    const codexRet = runCodexPlanner(prompt, model);
    if (codexRet.ok) return codexRet;
    return { ok: false, error: `api+codex failed: ${apiRet.error}; ${codexRet.error}` };
  }

  return runCodexPlanner(prompt, model);
}

module.exports = { runPlanner };
