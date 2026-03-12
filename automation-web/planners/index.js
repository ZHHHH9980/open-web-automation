"use strict";

const { runClaudePlanner } = require("./claude");
const { runApiPlanner } = require("./openai");
const { runCodexPlanner } = require("./codex");
const { resolveLocalCodexProvider } = require("../shared/codex-config");

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function getAutoPlannerBackends(env = process.env) {
  const order = [];
  const hasDirectOpenAI = Boolean(env.OWA_AGENT_API_KEY || env.OPENAI_API_KEY);
  const localCodexProvider = resolveLocalCodexProvider(env);
  const hasReusableCodex = Boolean(localCodexProvider?.has_api_key);
  const hasClaudeKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);

  if (hasDirectOpenAI) {
    order.push("openai");
  }
  if (hasReusableCodex) {
    order.push("codex");
  }
  if (hasClaudeKey) {
    order.push("claude");
  }
  if (!order.includes("codex")) {
    order.push("codex");
  }

  return order;
}

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

  const autoBackends = getAutoPlannerBackends(process.env);
  for (const candidate of autoBackends) {
    if (candidate === "openai") {
      const apiRet = await runApiPlanner(prompt, model, timeoutMs, screenshotB64);
      if (apiRet.ok) return apiRet;
      process.stderr.write(`[agent] OpenAI planner failed, trying next backend: ${apiRet.error}\n`);
      continue;
    }

    if (candidate === "codex") {
      const codexRet = runCodexPlanner(prompt, model || process.env.OWA_AGENT_CODEX_MODEL || process.env.OWA_AGENT_MODEL);
      if (codexRet.ok) return codexRet;
      process.stderr.write(`[agent] Codex planner failed, trying next backend: ${codexRet.error}\n`);
      continue;
    }

    if (candidate === "claude") {
      const claudeRet = await runClaudePlanner(prompt, model, timeoutMs, screenshotB64);
      if (claudeRet.ok) return claudeRet;
      process.stderr.write(`[agent] Claude planner failed, trying next backend: ${claudeRet.error}\n`);
    }
  }

  return { ok: false, error: "all planner backends failed" };
}

module.exports = {
  runPlanner,
  __internal: {
    getAutoPlannerBackends,
  },
};
