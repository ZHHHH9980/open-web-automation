"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolveLocalCodexProvider } = require("./codex-config");

const ROOT = path.resolve(__dirname, "..");

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function buildCodexGeneratorLabel(model, env = process.env) {
  const provider = resolveLocalCodexProvider(env);
  const modelName = String(model || env.OWA_AGENT_MODEL || env.OWA_AGENT_CODEX_MODEL || "default").trim();
  if (provider?.provider_key) {
    return `Codex ${modelName} via ${provider.provider_key}`;
  }
  return `Codex ${modelName}`;
}

function runCodexJsonPrompt(prompt, model, options = {}) {
  const outPath = path.join(os.tmpdir(), `owa-codex-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const timeoutMs = Math.max(10000, toInt(options.timeoutMs || process.env.OWA_AGENT_PLAN_TIMEOUT_MS, 60000));
  const reasoning = String(options.reasoning || process.env.OWA_AGENT_CODEX_REASONING || "low").trim();
  const cwd = options.cwd || ROOT;

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "--output-last-message",
    outPath,
  ];

  if (model) {
    args.push("-m", model);
  }
  if (reasoning) {
    args.push("-c", `model_reasoning_effort=\"${reasoning}\"`);
  }
  args.push(prompt);

  const ret = spawnSync("codex", args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: timeoutMs,
  });

  const label = buildCodexGeneratorLabel(model);

  if (ret.error && ret.error.code === "ETIMEDOUT") {
    return { ok: false, error: "codex timeout", label };
  }
  if (ret.status !== 0) {
    const detail = (ret.stderr || ret.stdout || "codex exited non-zero").replace(/\s+/g, " ").trim();
    return { ok: false, error: detail, label };
  }
  if (!fs.existsSync(outPath)) {
    return { ok: false, error: "codex did not produce output", label };
  }

  try {
    const raw = fs.readFileSync(outPath, "utf8").trim();
    if (!raw) return { ok: false, error: "codex output is empty", label };
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    return {
      ok: true,
      parsed: JSON.parse(jsonText),
      label,
    };
  } catch (err) {
    return { ok: false, error: `parse codex output failed: ${err.message || err}`, label };
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch (_err) {
      // ignore
    }
  }
}

module.exports = {
  buildCodexGeneratorLabel,
  runCodexJsonPrompt,
};
