"use strict";

const { getAllowedActionNames, validateActionDecision } = require("../flows/act/actions/registry");

async function runClaudePlanner(prompt, model, timeoutMs, screenshotB64) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    return { ok: false, error: "missing ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN for claude planner" };
  }

  const base = String(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const plannerModel = model || process.env.OWA_AGENT_MODEL || "claude-sonnet-4-6";

  process.stderr.write(`[agent] using Claude backend, model=${plannerModel}\n`);

  const allowedActionsStr = getAllowedActionNames().sort().join(", ");
  const system = [
    "You output one JSON object only.",
    "No markdown, no extra text.",
    `JSON must match this action enum exactly: ${allowedActionsStr}.`,
    "Always include reason.",
    "Use the current page metadata and captured API context to choose valid actions.",
  ].join("\n");

  const messageContent = [{
    type: "text",
    text: prompt,
  }];

  const body = {
    model: plannerModel,
    max_tokens: 1024,
    temperature: 0,
    system,
    messages: [
      { role: "user", content: messageContent },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return { ok: false, error: `claude planner http ${resp.status} ${t.replace(/\s+/g, " ").trim().slice(0, 240)}` };
    }

    const data = await resp.json();
    const content = data?.content?.[0]?.text;
    if (!content) {
      return { ok: false, error: "claude planner returned empty content" };
    }

    const jsonText = content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) {
      return { ok: false, error: "claude planner returned non-json content" };
    }

    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.plan)) {
      return { ok: true, decision: parsed };
    }
    const decision = validateActionDecision(parsed);
    if (!decision) {
      return {
        ok: false,
        error: "claude planner output failed local validation",
        decision: parsed,
      };
    }
    return { ok: true, decision };
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { ok: false, error: "claude planner timeout" };
    }
    return { ok: false, error: `claude planner error: ${(err.message || err).replace(/\s+/g, " ").trim()}` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { runClaudePlanner };
