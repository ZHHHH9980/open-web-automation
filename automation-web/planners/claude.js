"use strict";

const { ALLOWED_ACTIONS } = require("../core/constants");

/**
 * Claude planner backend
 * Uses Anthropic API with vision support
 */
async function runClaudePlanner(prompt, model, timeoutMs, screenshotB64) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    return { ok: false, error: "missing ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN for claude planner" };
  }

  const base = String(
    process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"
  ).replace(/\/$/, "");
  const plannerModel = model || process.env.OWA_AGENT_MODEL || "claude-sonnet-4-6";

  process.stderr.write(`[agent] using Claude backend, model=${plannerModel}\n`);

  const system = [
    "You output one JSON object only.",
    "No markdown, no extra text.",
    "JSON must match this action enum exactly: goto, click, type, press, scroll, wait, extract, close, back, done, fail, pause.",
    "Always include reason.",
    "You can see a screenshot of the current page. Use it to identify clickable elements.",
  ].join("\n");

  const messageContent = [];
  if (screenshotB64) {
    messageContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: screenshotB64,
      },
    });
  }
  messageContent.push({
    type: "text",
    text: prompt,
  });

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
    const decision = validateDecision(parsed);
    if (!decision) {
      // Return parsed object even if validation failed
      return {
        ok: false,
        error: "claude planner output failed local validation",
        decision: parsed
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

function validateDecision(obj) {
  if (!obj || typeof obj !== "object") return null;
  const action = String(obj.action || "").toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) return null;
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

  // Extract action parameters
  if (obj.label != null) out.label = String(obj.label);
  if (obj.max_length != null && Number.isFinite(Number(obj.max_length))) out.max_length = Math.floor(Number(obj.max_length));

  // Close action parameters
  if (obj.method != null) out.method = String(obj.method);
  if (obj.use_back != null) out.use_back = Boolean(obj.use_back);
  if (obj.press_enter != null) out.press_enter = Boolean(obj.press_enter);

  if (obj.x != null && Number.isFinite(Number(obj.x))) out.x = Math.max(0, Math.floor(Number(obj.x)));
  if (obj.y != null && Number.isFinite(Number(obj.y))) out.y = Math.max(0, Math.floor(Number(obj.y)));

  return out;
}

module.exports = { runClaudePlanner };
