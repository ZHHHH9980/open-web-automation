"use strict";

const { grabBodyText, makeScreenshot } = require("./browser");

/**
 * Collect interactive candidates from page
 */
async function collectCandidates(page, limit) {
  return page.evaluate((maxCount) => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width < 4 || rect.height < 4) return false;
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") < 0.05) return false;
      return true;
    }

    function safeText(el) {
      const innerText = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const ariaLabel = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";

      if (innerText) return innerText.slice(0, 120);
      if (ariaLabel) return ariaLabel.slice(0, 120);
      if (title) return title.slice(0, 120);

      return "";
    }

    function esc(v) {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(v);
      return String(v).replace(/([#.;,[\]:()>+~*'"\\ s])/g, "\\$1");
    }

    function nthOfType(el) {
      const tag = el.tagName.toLowerCase();
      let idx = 1;
      let prev = el.previousElementSibling;
      while (prev) {
        if (prev.tagName.toLowerCase() === tag) idx += 1;
        prev = prev.previousElementSibling;
      }
      return idx;
    }

    function cssPath(el) {
      if (el.id) return `#${esc(el.id)}`;
      const dataTestId = el.getAttribute("data-testid") || el.getAttribute("data-test");
      if (dataTestId) return `[data-testid="${esc(dataTestId)}"]`;
      const parts = [];
      let cur = el;
      let depth = 0;
      while (cur && cur.nodeType === 1 && depth < 5) {
        const tag = cur.tagName.toLowerCase();
        const part = `${tag}:nth-of-type(${nthOfType(cur)})`;
        parts.unshift(part);
        if (cur.id) {
          parts[0] = `#${esc(cur.id)}`;
          break;
        }
        cur = cur.parentElement;
        depth += 1;
      }
      return parts.join(" > ");
    }

    const nodes = Array.from(
      document.querySelectorAll("a,button,input,textarea,select,[role='button'],[role='link'],[contenteditable='true']")
    );
    const seen = new Set();
    const out = [];

    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = safeText(node);
      const selector = cssPath(node);
      if (!selector) continue;
      const key = `${selector}__${text}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        id: out.length + 1,
        tag: node.tagName.toLowerCase(),
        role: (node.getAttribute("role") || "").toLowerCase(),
        type: (node.getAttribute("type") || "").toLowerCase(),
        text,
        selector,
      });
      if (out.length >= maxCount) break;
    }

    if (out.length < maxCount) {
      const allElements = Array.from(document.querySelectorAll("div,span,li,article,section"));
      for (const el of allElements) {
        if (out.length >= maxCount) break;
        if (!isVisible(el)) continue;

        const style = window.getComputedStyle(el);
        const hasClickCursor = style.cursor === "pointer";
        const hasOnClick = el.onclick !== null || el.getAttribute("onclick");
        const hasClickClass = el.className && (
          el.className.includes("click") ||
          el.className.includes("card") ||
          el.className.includes("item") ||
          el.className.includes("link")
        );

        if (!hasClickCursor && !hasOnClick && !hasClickClass) continue;

        const text = safeText(el);
        if (!text || text.length < 2) continue;

        const selector = cssPath(el);
        if (!selector) continue;
        const key = `${selector}__${text}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          id: out.length + 1,
          tag: el.tagName.toLowerCase(),
          role: "clickable-fallback",
          type: "",
          text,
          selector,
        });
      }
    }

    return out;
  }, Math.max(5, Math.min(120, limit)));
}

/**
 * Collect complete page state for planner
 */
async function collectPageState(page, step, candidateLimit) {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
  } catch (_err) {
    // ignore timeout
  }

  const url = page.url();
  const title = await page.title().catch(() => "");
  const text = await grabBodyText(page, 2000).catch(() => "");
  const candidates = await collectCandidates(page, candidateLimit).catch(() => []);
  const label = `agent-step-${step}`;
  const shot = await makeScreenshot(page, label);

  return {
    step,
    url,
    title,
    body_text: text,
    screenshot_path: shot.filePath || "",
    screenshot_b64: shot.base64 || "",
    candidates,
  };
}

module.exports = { collectPageState, collectCandidates };
