"use strict";

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/**
 * Resolve selector from decision
 */
function resolveSelector(decision, state) {
  if (decision.selector) return decision.selector;
  if (!decision.target_id) return "";
  const hit = (state.candidates || []).find((x) => Number(x.id) === Number(decision.target_id));
  return hit ? hit.selector : "";
}

/**
 * Execute a planner decision
 */
async function executeDecision(page, decision, state) {
  const action = decision.action;

  if (action === "goto") {
    if (!decision.url) throw new Error("goto requires url");
    await page.goto(decision.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    return { done: false, note: `goto ${decision.url}` };
  }

  if (action === "click") {
    if (decision.x != null && decision.y != null) {
      await page.mouse.click(decision.x, decision.y);
      return { done: false, note: `click at (${decision.x}, ${decision.y})` };
    }

    const selector = resolveSelector(decision, state);
    if (!selector) throw new Error("click requires selector, valid target_id, or coordinates (x, y)");
    await page.locator(selector).first().click({ timeout: 10000 });
    return { done: false, note: `click ${selector}` };
  }

  if (action === "type") {
    const selector = resolveSelector(decision, state);
    if (!selector) throw new Error("type requires selector or valid target_id");
    const text = decision.text != null ? String(decision.text) : "";
    const clearFirst = decision.clear_first !== false;
    const locator = page.locator(selector).first();
    await locator.click({ timeout: 10000 });
    if (clearFirst) {
      try {
        await locator.fill("");
      } catch (_err) {
        // ignore
      }
    }
    try {
      await locator.fill(text);
    } catch (_err) {
      await page.keyboard.type(text, { delay: 15 });
    }
    if (decision.press_enter) {
      await page.keyboard.press("Enter");
    }
    return { done: false, note: `type ${selector}` };
  }

  if (action === "press") {
    const key = decision.key || "Enter";
    await page.keyboard.press(key);
    return { done: false, note: `press ${key}` };
  }

  if (action === "scroll") {
    const px = Number.isFinite(Number(decision.scroll_px)) ? Number(decision.scroll_px) : 900;
    await page.mouse.wheel(0, px);
    return { done: false, note: `scroll ${px}` };
  }

  if (action === "wait") {
    const ms = Number.isFinite(Number(decision.wait_ms)) ? toInt(decision.wait_ms, 1200) : 1200;
    await page.waitForTimeout(Math.max(200, Math.min(ms, 20000)));
    return { done: false, note: `wait ${ms}` };
  }

  if (action === "done") {
    return {
      done: true,
      success: true,
      result: decision.result || "task completed",
      data: decision.data || {},
      note: "done",
    };
  }

  if (action === "fail") {
    return {
      done: true,
      success: false,
      result: decision.result || decision.reason || "planner marked as failed",
      data: decision.data || {},
      note: "fail",
    };
  }

  if (action === "pause") {
    return {
      done: true,
      success: false,
      requiresHuman: true,
      result: decision.result || decision.reason || "paused for human intervention",
      data: decision.data || {},
      note: "pause",
    };
  }

  throw new Error(`unsupported action: ${action}`);
}

module.exports = { executeDecision, resolveSelector };
