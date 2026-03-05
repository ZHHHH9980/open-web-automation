"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const ACTION_SCHEMA_PATH = path.join(ROOT, "adapter", "agent-action.schema.json");

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/**
 * Codex planner backend
 * Uses codex CLI tool
 */
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
    if (!raw) return { ok: false, error: "codex output is empty" };
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    const parsed = JSON.parse(jsonText);
    const decision = validateDecision(parsed);
    if (!decision) return { ok: false, error: `codex output failed local validation: ${jsonText.replace(/\s+/g, " ").trim().slice(0, 240)}` };
    return { ok: true, decision };
  } catch (err) {
    return { ok: false, error: `parse codex output failed: ${err.message || err}` };
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch (_err) {
      // ignore
    }
  }
}

function validateDecision(obj) {
  if (!obj || typeof obj !== "object") return null;
  const action = String(obj.action || "").toLowerCase();
  const allowed = new Set(["goto", "click", "type", "press", "scroll", "wait", "done", "fail", "pause"]);
  if (!allowed.has(action)) return null;
  const reason = (obj.reason || "planner_decision").replace(/\s+/g, " ").trim();

  const out = { action, reason };

  if (obj.url != null) out.url = String(obj.url);
  if (obj.selector != null) out.selector = String(obj.selector);
  if (obj.text != null) out.text = String(obj.text);
  if (obj.key != null) out.key = String(obj.key);
  if (obj.result != null) out.result = String(obj.result);
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) out.data = obj.data;

  if (obj.target_id != null && Number.isFinite(Number(obj.target_id))) out.target_id = Math.max(1, Math.floor(Number(obj.target_id)));
  if (obj.wait_ms != null && Number.isFinite(Number(obj.wait_ms))) out.wait_ms = Math.max(0, Math.min(20000, Math.floor(Number(obj.wait_ms))));
  if (obj.scroll_px != null && Number.isFinite(Number(obj.scroll_px))) out.scroll_px = Math.floor(Number(obj.scroll_px));
  if (obj.clear_first != null) out.clear_first = Boolean(obj.clear_first);
  if (obj.press_enter != null) out.press_enter = Boolean(obj.press_enter);

  if (obj.x != null && Number.isFinite(Number(obj.x))) out.x = Math.max(0, Math.floor(Number(obj.x)));
  if (obj.y != null && Number.isFinite(Number(obj.y))) out.y = Math.max(0, Math.floor(Number(obj.y)));

  return out;
}

module.exports = { runCodexPlanner };
