"use strict";

const { validateActionDecision } = require("../flows/act/actions/registry");
const { runCodexJsonPrompt } = require("../shared/codex-cli");

function runCodexPlanner(prompt, model) {
  process.stderr.write(`[agent] using Codex backend, model=${model || "default"}\n`);

  const ret = runCodexJsonPrompt(prompt, model, {
    timeoutMs: process.env.OWA_AGENT_PLAN_TIMEOUT_MS,
    reasoning: process.env.OWA_AGENT_CODEX_REASONING || "low",
  });

  if (!ret.ok) {
    return { ok: false, error: ret.error };
  }

  const parsed = ret.parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.plan)) {
    return { ok: true, decision: parsed };
  }

  const decision = validateActionDecision(parsed);
  if (!decision) {
    return {
      ok: false,
      error: `codex output failed local validation: ${JSON.stringify(parsed).replace(/\s+/g, " ").trim().slice(0, 240)}`,
      decision: parsed,
    };
  }
  return { ok: true, decision };
}

module.exports = { runCodexPlanner };
