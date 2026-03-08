"use strict";

const { getAllowedActionNames, validateActionDecision } = require("../flows/act/actions/registry");

async function runApiPlanner(prompt, model, timeoutMs, screenshotB64) {
  const apiKey = process.env.OWA_AGENT_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "missing OWA_AGENT_API_KEY/OPENAI_API_KEY for api planner" };
  }

  const base = String(
    process.env.OWA_AGENT_BASE_URL || process.env.OPENAI_BASE_URL || process.env.OWA_PLANNER_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const plannerModel = model || process.env.OWA_AGENT_MODEL || process.env.OWA_PLANNER_MODEL || "gpt-5.4";

  process.stderr.write(`[agent] using OpenAI backend, model=${plannerModel}\n`);

  const allowedActionsStr = getAllowedActionNames().sort().join(", ");
  const system = [
    "You output one JSON object only.",
    "No markdown, no extra text.",
    `JSON must match this action enum exactly: ${allowedActionsStr}.`,
    "Always include reason.",
    "Use the current page metadata and captured API context to choose valid actions.",
  ].join("\n");

  const userContent = [{
    type: "text",
    text: prompt,
  }];

  const body = {
    model: plannerModel,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return { ok: false, error: `api planner http ${resp.status} ${t.replace(/\s+/g, " ").trim().slice(0, 240)}` };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    const contentText = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((x) => typeof x === "string" ? x : x?.text || "").join("\n")
        : "";
    const jsonText = contentText.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) {
      return { ok: false, error: "api planner returned non-json content" };
    }

    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.plan)) {
      return { ok: true, decision: parsed };
    }
    const decision = validateActionDecision(parsed);
    if (!decision) {
      return { ok: false, error: "api planner output failed local validation" };
    }
    return { ok: true, decision };
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { ok: false, error: "api planner timeout" };
    }
    return { ok: false, error: `api planner error: ${(err.message || err).replace(/\s+/g, " ").trim()}` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { runApiPlanner };
