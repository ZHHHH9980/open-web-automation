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

  // Scroll action removed - use selectors to extract content directly

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

  if (action === "extract") {
    // Extract content from current page
    const selector = decision.selector || resolveSelector(decision, state);
    const label = decision.label || "unlabeled";
    const maxLength = Number.isFinite(Number(decision.max_length)) ? Number(decision.max_length) : 5000;

    let content = "";
    let fullLength = 0;

    if (selector) {
      // Extract from specific element
      try {
        const text = await page.locator(selector).first().innerText({ timeout: 5000 });
        fullLength = text.length;
        content = text.slice(0, maxLength);
      } catch (err) {
        throw new Error(`extract failed: ${err.message}`);
      }
    } else {
      // Extract from entire page body
      try {
        const text = await page.locator("body").innerText({ timeout: 5000 });
        fullLength = text.length;
        content = text.slice(0, maxLength);
      } catch (err) {
        throw new Error(`extract failed: ${err.message}`);
      }
    }

    return {
      done: false,
      data: {
        label,
        content,
        full_length: fullLength,
      },
      note: `extract ${label}`,
    };
  }

  if (action === "collect") {
    // Collect list items from container
    const containerSelector = decision.selector || resolveSelector(decision, state);
    if (!containerSelector) throw new Error("collect requires selector or valid target_id");

    const itemSelector = decision.item_selector || "> *";
    const maxItems = Number.isFinite(Number(decision.max_items)) ? Number(decision.max_items) : 50;

    const results = await page.evaluate(({ container, item, max }) => {
      const containerEl = document.querySelector(container);
      if (!containerEl) return [];

      const items = Array.from(containerEl.querySelectorAll(item)).slice(0, max);
      return items.map(section => {
        // Extract all links
        const links = Array.from(section.querySelectorAll("a")).map(a => ({
          href: a.href,
          text: a.innerText?.trim() || ""
        }));

        // Extract full text content
        const fullText = section.innerText?.trim() || "";

        return {
          links,
          fullText
        };
      });
    }, { container: containerSelector, item: itemSelector, max: maxItems });

    return {
      done: false,
      data: {
        items: results,
        count: results.length
      },
      note: `collect ${results.length} items from ${containerSelector}`
    };
  }

  if (action === "close") {
    // Close modal/popup or go back
    // Strategy 1: Try pressing Escape key (works for most modals)
    // Strategy 2: Try clicking close button if specified
    // Strategy 3: Go back in history

    if (decision.method === "back" || decision.use_back) {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
      return { done: false, note: "close via back" };
    }

    if (decision.selector || decision.target_id) {
      // Click close button
      const selector = resolveSelector(decision, state);
      if (!selector) throw new Error("close requires valid selector or target_id");
      await page.locator(selector).first().click({ timeout: 5000 });
      return { done: false, note: `close via click ${selector}` };
    }

    // Default: press Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    return { done: false, note: "close via Escape" };
  }

  throw new Error(`unsupported action: ${action}`);
}

module.exports = { executeDecision, resolveSelector };
