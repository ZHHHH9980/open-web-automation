"use strict";

/**
 * OpenAI planner backend
 * Uses OpenAI API with vision support
 */
async function runApiPlanner(prompt, model, timeoutMs, screenshotB64) {
  const apiKey = process.env.OWA_AGENT_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "missing OWA_AGENT_API_KEY/OPENAI_API_KEY for api planner" };
  }

  const base = String(
    process.env.OWA_AGENT_BASE_URL || process.env.OPENAI_BASE_URL || process.env.OWA_PLANNER_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const plannerModel = model || process.env.OWA_AGENT_MODEL || process.env.OWA_PLANNER_MODEL || "gpt-4o-mini";

  process.stderr.write(`[agent] using OpenAI backend, model=${plannerModel}, has_screenshot=${Boolean(screenshotB64)}\n`);

  const system = [
    "You output one JSON object only.",
    "No markdown, no extra text.",
    "JSON must match this action enum exactly: goto, click, type, press, scroll, wait, done, fail, pause.",
    "Always include reason.",
    "You can see a screenshot of the current page. Use it to identify clickable elements.",
  ].join("\n");

  const userContent = [];
  if (screenshotB64) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${screenshotB64}`,
      },
    });
  }
  userContent.push({
    type: "text",
    text: prompt,
  });

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
    const contentText = typeof content === "string" ? content : Array.isArray(content) ? content.map(x => typeof x === "string" ? x : x?.text || "").join("\n") : "";
    const jsonText = contentText.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) {
      return { ok: false, error: "api planner returned non-json content" };
    }

    const parsed = JSON.parse(jsonText);
    const decision = validateDecision(parsed);
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

module.exports = { runApiPlanner };
