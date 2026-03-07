"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { validateActionDecision } = require("../flows/act/actions/registry");

const ROOT = path.resolve(__dirname, "../..");
const ACTION_SCHEMA_PATH = path.join(ROOT, "adapter", "agent-action.schema.json");

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function runCodexPlanner(prompt, model) {
  process.stderr.write(`[agent] using Codex backend, model=${model || "default"}\n`);

  const outPath = path.join(os.tmpdir(), `owa-agent-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const useOutputSchema = process.env.OWA_AGENT_CODEX_OUTPUT_SCHEMA === "1";
  if (useOutputSchema && !fs.existsSync(ACTION_SCHEMA_PATH)) {
    return { ok: false, error: `missing action schema: ${ACTION_SCHEMA_PATH}` };
  }

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "--output-last-message",
    outPath,
    prompt,
  ];
  if (useOutputSchema) {
    args.splice(args.length - 2, 0, "--output-schema", ACTION_SCHEMA_PATH);
  }
  if (model) {
    args.splice(args.length - 1, 0, "-m", model);
  }
  const reasoning = process.env.OWA_AGENT_CODEX_REASONING || "low";
  if (reasoning) {
    args.splice(args.length - 1, 0, "-c", `model_reasoning_effort=\"${reasoning}\"`);
  }

  const ret = spawnSync("codex", args, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: Math.max(10000, toInt(process.env.OWA_AGENT_PLAN_TIMEOUT_MS, 60000)),
  });

  if (ret.error && ret.error.code === "ETIMEDOUT") {
    return { ok: false, error: "codex planner timeout" };
  }
  if (ret.status !== 0) {
    const detail = (ret.stderr || ret.stdout || "codex exited non-zero").replace(/\s+/g, " ").trim();
    return { ok: false, error: detail };
  }
  if (!fs.existsSync(outPath)) {
    return { ok: false, error: "codex did not produce output" };
  }

  try {
    const raw = fs.readFileSync(outPath, "utf8").trim();
    if (!raw) return { ok: false, error: "codex output is empty", decision: null };
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    const parsed = JSON.parse(jsonText);

    if (parsed && typeof parsed === "object" && Array.isArray(parsed.plan)) {
      return { ok: true, decision: parsed };
    }

    const decision = validateActionDecision(parsed);
    if (!decision) {
      return {
        ok: false,
        error: `codex output failed local validation: ${jsonText.replace(/\s+/g, " ").trim().slice(0, 240)}`,
        decision: parsed,
      };
    }
    return { ok: true, decision };
  } catch (err) {
    return { ok: false, error: `parse codex output failed: ${err.message || err}`, decision: null };
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch (_err) {
      // ignore
    }
  }
}

module.exports = { runCodexPlanner };
