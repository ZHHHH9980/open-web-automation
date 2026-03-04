"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { connectBrowser, getAutomationPage, grabBodyText, makeScreenshot, markHumanPauseTab } = require("./core/browser");
const { toResult, looksLikeHumanIntervention } = require("./core/result");
const { guessSeedUrl: guessSeedUrlFromLearning } = require("./learning/system");

const ROOT = path.resolve(__dirname, "..");
const ACTION_SCHEMA_PATH = path.join(ROOT, "adapter", "agent-action.schema.json");
const RULES_DIR = path.join(ROOT, "adapter", "rules");
const RULES_FILE = path.join(RULES_DIR, "auto-corrections.jsonl");

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function logProgress(enabled, msg) {
  if (!enabled) return;
  process.stderr.write(`[agent] ${msg}\n`);
}

function guessSeedUrl(task) {
  // 使用学习系统（包含 Google 搜索 fallback）
  return guessSeedUrlFromLearning(task);
}

function ensureRulesStore() {
  if (!fs.existsSync(RULES_DIR)) fs.mkdirSync(RULES_DIR, { recursive: true });
  if (!fs.existsSync(RULES_FILE)) fs.writeFileSync(RULES_FILE, "", "utf8");
}

function loadRecentRules(limit = 12) {
  try {
    ensureRulesStore();
    const lines = fs
      .readFileSync(RULES_FILE, "utf8")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const rows = [];
    for (let i = Math.max(0, lines.length - limit); i < lines.length; i += 1) {
      try {
        rows.push(JSON.parse(lines[i]));
      } catch (_err) {
        // ignore bad line
      }
    }
    return rows;
  } catch (_err) {
    return [];
  }
}

function appendRuleCorrection(record) {
  try {
    ensureRulesStore();
    fs.appendFileSync(RULES_FILE, `${JSON.stringify(record)}\n`, "utf8");
  } catch (_err) {
    // ignore
  }
}

function extractJsonObject(s) {
  const m = String(s || "").match(/\{[\s\S]*\}/);
  return m ? m[0] : "";
}

function validateDecision(obj) {
  if (!obj || typeof obj !== "object") return null;
  const action = String(obj.action || "").toLowerCase();
  const allowed = new Set(["goto", "click", "type", "press", "scroll", "wait", "done", "fail", "pause"]);
  if (!allowed.has(action)) return null;
  const reason = normalizeText(obj.reason || "planner_decision");

  const out = {
    action,
    reason,
  };

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

  // Support coordinate-based clicking as fallback
  if (obj.x != null && Number.isFinite(Number(obj.x))) out.x = Math.max(0, Math.floor(Number(obj.x)));
  if (obj.y != null && Number.isFinite(Number(obj.y))) out.y = Math.max(0, Math.floor(Number(obj.y)));

  return out;
}

function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x.text === "string") return x.text;
        return "";
      })
      .join("\n");
  }
  return "";
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
    const detail = normalizeText(ret.stderr || ret.stdout || "codex exited non-zero");
    return { ok: false, error: detail };
  }
  if (!fs.existsSync(outPath)) {
    return { ok: false, error: "codex did not produce output" };
  }

  try {
    const raw = fs.readFileSync(outPath, "utf8").trim();
    if (!raw) return { ok: false, error: "codex output is empty" };
    const jsonText = extractJsonObject(raw) || raw;
    const parsed = JSON.parse(jsonText);
    const decision = validateDecision(parsed);
    if (!decision) return { ok: false, error: `codex output failed local validation: ${normalizeText(jsonText).slice(0, 240)}` };
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

  // Build message content with screenshot if available (OpenAI vision format)
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
      return { ok: false, error: `api planner http ${resp.status} ${normalizeText(t).slice(0, 240)}` };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    const contentText = extractMessageText(content);
    const jsonText = extractJsonObject(contentText);
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
    return { ok: false, error: `api planner error: ${normalizeText(err.message || err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function runClaudePlanner(prompt, model, timeoutMs, screenshotB64) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    return { ok: false, error: "missing ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN for claude planner" };
  }

  const base = String(
    process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"
  ).replace(/\/$/, "");
  const plannerModel = model || process.env.OWA_AGENT_MODEL || "claude-sonnet-4-6";

  process.stderr.write(`[agent] using Claude backend, model=${plannerModel}, has_screenshot=${Boolean(screenshotB64)}\n`);

  const system = [
    "You output one JSON object only.",
    "No markdown, no extra text.",
    "JSON must match this action enum exactly: goto, click, type, press, scroll, wait, done, fail, pause.",
    "Always include reason.",
    "You can see a screenshot of the current page. Use it to identify clickable elements.",
  ].join("\n");

  // Build message content with screenshot if available
  const messageContent = [];
  if (screenshotB64) {
    messageContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",  // 修正：截图是 JPEG 格式
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
      return { ok: false, error: `claude planner http ${resp.status} ${normalizeText(t).slice(0, 240)}` };
    }

    const data = await resp.json();
    const content = data?.content?.[0]?.text;
    if (!content) {
      return { ok: false, error: "claude planner returned empty content" };
    }

    const jsonText = extractJsonObject(content);
    if (!jsonText) {
      return { ok: false, error: "claude planner returned non-json content" };
    }

    const parsed = JSON.parse(jsonText);
    const decision = validateDecision(parsed);
    if (!decision) {
      return { ok: false, error: "claude planner output failed local validation" };
    }
    return { ok: true, decision };
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { ok: false, error: "claude planner timeout" };
    }
    return { ok: false, error: `claude planner error: ${normalizeText(err.message || err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function runPlanner(prompt, model, screenshotB64) {
  const backend = String(process.env.OWA_AGENT_BACKEND || "auto").toLowerCase();
  const timeoutMs = Math.max(5000, toInt(process.env.OWA_AGENT_PLAN_TIMEOUT_MS, 60000));

  if (backend === "claude" || backend === "anthropic") {
    return runClaudePlanner(prompt, model, timeoutMs, screenshotB64);
  }
  if (backend === "api" || backend === "openai") {
    return runApiPlanner(prompt, model, timeoutMs, screenshotB64);
  }
  if (backend === "codex" || backend === "codex-cli") {
    return runCodexPlanner(prompt, model);
  }

  const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (hasClaudeKey) {
    const claudeRet = await runClaudePlanner(prompt, model, timeoutMs, screenshotB64);
    if (claudeRet.ok) return claudeRet;
  }

  const hasApiKey = Boolean(process.env.OWA_AGENT_API_KEY || process.env.OPENAI_API_KEY);
  if (hasApiKey) {
    const apiRet = await runApiPlanner(prompt, model, timeoutMs, screenshotB64);
    if (apiRet.ok) return apiRet;
    const codexRet = runCodexPlanner(prompt, model);
    if (codexRet.ok) return codexRet;
    return { ok: false, error: `api+codex failed: ${apiRet.error}; ${codexRet.error}` };
  }

  return runCodexPlanner(prompt, model);
}

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
      // Separate different types of text to avoid confusion
      const innerText = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const ariaLabel = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";

      // Prefer actual content over attributes
      if (innerText) return innerText.slice(0, 120);
      if (ariaLabel) return ariaLabel.slice(0, 120);
      if (title) return title.slice(0, 120);

      return "";
    }

    function esc(v) {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(v);
      return String(v).replace(/([#.;,[\]:()>+~*'"\\\s])/g, "\\$1");
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

    // Primary: collect standard interactive elements
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

    // Fallback: collect clickable divs/spans with onclick or cursor:pointer
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
        if (!text || text.length < 2) continue; // Skip elements with no meaningful text

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

async function collectPageState(page, step, candidateLimit) {
  // Wait for page to be stable after navigation
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
  } catch (_err) {
    // ignore timeout, continue anyway
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

function buildPlannerPrompt(task, step, maxSteps, state, history, rules, possibleLoginDetected) {
  const payload = {
    task,
    step,
    max_steps: maxSteps,
    current_url: state.url,
    page_title: state.title,
    body_text: state.body_text,
    screenshot_path: state.screenshot_path,
    candidates: state.candidates,
    history,
    recent_corrections: rules,
  };

  const promptLines = [
    "You are controlling Playwright through one structured action at a time.",
    "Goal: finish the user task quickly and safely.",
    "You must output exactly one JSON object that matches the provided schema.",
    "",
  ];

  // 如果检测到可能的登录提示，添加警告
  if (possibleLoginDetected) {
    promptLines.push(
      "⚠️ WARNING: Possible login/verification detected in page text.",
      "Check the screenshot carefully to confirm if login is actually required.",
      "If you see a login popup/modal blocking content → use 'fail' immediately.",
      "If the page is accessible (user already logged in) → proceed normally.",
      ""
    );
  }

  promptLines.push(
    "CORE PRINCIPLE: Vision-Enabled Automation",
    "- Primary: Use DOM selectors (candidates) for speed and reliability",
    "- Fallback: Use screenshot + coordinates when DOM fails",
    "- You have BOTH tools - choose wisely based on the situation",
    "",
    "Rules:",
    "1) DOM First - Prefer target_id from candidates when available.",
    "",
    "2) Vision Fallback - When DOM is not enough:",
    "   - Candidates list is empty",
    "   - Candidates don't have what you need",
    "   - Element exists in screenshot but not in candidates",
    "   → Use coordinate-based clicking: {\"action\": \"click\", \"x\": 500, \"y\": 300}",
    "   → Trust the screenshot - it shows EXACTLY what's on the page",
    "",
    "3) Decision Priority - When you can't find what you need:",
    "   Priority 1: Check screenshot carefully - can you see the target?",
    "   Priority 2: If visible in screenshot → use coordinates to click",
    "   Priority 3: If not visible → use 'wait' to let page load",
    "   Priority 4: If still not visible after wait → scroll to find it",
    "   Priority 5: If truly impossible → use 'fail'",
    "   ",
    "   CRITICAL: Do NOT scroll before checking screenshot!",
    "   Scrolling loses content - use vision first!",
    "",
    "4) Login/Auth Detection - PAUSE for human:",
    "   BEFORE any action, check screenshot for login/auth blockers:",
    "   ",
    "   Step 1: Look at screenshot - is there a login popup/modal/dialog?",
    "   Step 2: If YES → Use 'pause' action immediately",
    "           - reason: describe what login method is shown (QR code, password, etc.)",
    "           - result: 'Login required - paused for human intervention'",
    "   Step 3: If NO login blocker → proceed with task normally",
    "   ",
    "   IMPORTANT: Do NOT try to close login popups or bypass them!",
    "   Just pause and let human handle login.",
    "",
    "5) Natural interaction flow:",
    "   - After typing in search box → press Enter",
    "   - After pressing Enter → wait for page load",
    "   - Then check screenshot and proceed",
    "",
    "6) Multi-step tasks:",
    "   - Parse the task to identify ALL required steps",
    "   - Track progress in your reason field",
    "   - Only return 'done' when ALL steps are completed",
    "   - In result field, summarize what you accomplished",
    "",
    "7) When to use 'pause' vs 'fail':",
    "   - Use 'pause': Login/auth required (human can handle)",
    "   - Use 'fail': Technical errors, page not found, truly impossible",
    "",
    "8) Use goto only when you need navigation.",
    "",
    "9) Search Strategy - Exact query matching:",
    "   Step 1: Extract the COMPLETE search query from task (all words, all details)",
    "   Step 2: Before clicking any search suggestion/shortcut:",
    "           - Does it contain ALL words from my search query?",
    "           - If NO → find search input box, use 'type' action instead",
    "   Step 3: After typing → use 'press' action with key='Enter'",
    "   ",
    "   Principle: Never lose information. Type manually when shortcuts are incomplete.",
    "",
    "State JSON:",
    JSON.stringify(payload, null, 2)
  );

  return promptLines.join("\n");
}

function resolveSelector(decision, state) {
  if (decision.selector) return decision.selector;
  if (!decision.target_id) return "";
  const hit = (state.candidates || []).find((x) => Number(x.id) === Number(decision.target_id));
  return hit ? hit.selector : "";
}

async function executeDecision(page, decision, state) {
  const action = decision.action;
  if (action === "goto") {
    if (!decision.url) throw new Error("goto requires url");
    await page.goto(decision.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    return { done: false, note: `goto ${decision.url}` };
  }

  if (action === "click") {
    // Try coordinate-based clicking first (fallback for vision-based detection)
    if (decision.x != null && decision.y != null) {
      await page.mouse.click(decision.x, decision.y);
      return { done: false, note: `click at (${decision.x}, ${decision.y})` };
    }

    // Otherwise use selector-based clicking
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

async function runAgentTask(rawTask, opts = {}) {
  const task = normalizeText(rawTask);
  if (!task) {
    return toResult({
      success: false,
      exit_code: 2,
      message: "task is empty",
      meta: { requires_human: false, url: "" },
    });
  }

  const cdpUrl = opts.cdpUrl || process.env.WEB_CDP_URL || "http://127.0.0.1:9222";
  const maxSteps = Math.max(1, toInt(process.env.OWA_AGENT_MAX_STEPS, 15));
  const candidateLimit = Math.max(20, toInt(process.env.OWA_AGENT_CANDIDATE_LIMIT, 30));
  const model = process.env.OWA_AGENT_CODEX_MODEL || "";
  const keepOpenOnHuman = process.env.WEB_KEEP_OPEN_ON_HUMAN !== "0";
  const keepOpen = opts.debugMode || process.env.WEB_KEEP_OPEN === "1";
  const debug = process.env.OWA_AGENT_DEBUG === "1";
  const progress = process.env.OWA_AGENT_PROGRESS !== "0";
  const timeoutMs = Math.max(1000, toInt(process.env.WEB_TASK_TIMEOUT_MS, 180000));
  const includeScreenshot = process.env.OWA_AGENT_INCLUDE_SCREENSHOT === "1"; // 默认不返回 base64 截图，只返回路径
  const startedAt = Date.now();

  let browser;
  let page;
  let lastShotPath = "";
  let lastShotB64 = "";
  let lastUrl = ""; // 跟踪最后访问的 URL
  const history = [];
  let requiresHuman = false;

  try {
    const conn = await connectBrowser(cdpUrl);
    browser = conn.browser;
    page = await getAutomationPage(conn.context);
    page.setDefaultTimeout(12000);
    logProgress(progress, `task started: ${task}`);

    for (let step = 1; step <= maxSteps; step += 1) {
      if (Date.now() - startedAt > timeoutMs) {
        return toResult({
          success: false,
          exit_code: 124,
          screenshot: lastShotB64,
          message: `task timeout (${timeoutMs}ms)`,
          meta: {
            requires_human: false,
            task,
            steps: history,
            screenshot_path: lastShotPath,
            url: lastUrl,
          },
        });
      }

      const state = await collectPageState(page, step, candidateLimit);
      lastShotPath = state.screenshot_path || lastShotPath;
      lastShotB64 = state.screenshot_b64 || lastShotB64;
      lastUrl = state.url || lastUrl; // 更新最后的 URL
      logProgress(progress, `step ${step}/${maxSteps} url=${state.url || "about:blank"} planning...`);

      // 清理浏览器状态：如果不是 about:blank 且是第一步，先清理
      if (step === 1 && !String(state.url || "").startsWith("about:blank")) {
        logProgress(progress, `cleaning browser state from ${state.url}`);
        await page.goto("about:blank");
        await page.waitForTimeout(300);

        // 现在执行 seed navigation
        const seedUrl = guessSeedUrl(task);
        logProgress(progress, `seed navigation -> ${seedUrl}`);
        await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
        history.push({
          step,
          action: "goto",
          reason: "seed_navigation_after_cleanup",
          note: `cleaned state, then goto ${seedUrl}`,
          url: "about:blank",
        });
        await page.waitForTimeout(600);
        continue;
      }

      if (step === 1 && String(state.url || "").startsWith("about:blank")) {
        const seedUrl = guessSeedUrl(task);
        logProgress(progress, `seed navigation -> ${seedUrl}`);
        await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
        history.push({
          step,
          action: "goto",
          reason: "seed_navigation",
          note: `goto ${seedUrl}`,
          url: state.url || "about:blank",
        });
        await page.waitForTimeout(600);
        continue;
      }

      // 完全移除关键词检测，让 LLM 通过截图判断
      const rules = loadRecentRules(10);
      const prompt = buildPlannerPrompt(task, step, maxSteps, state, history.slice(-8), rules, false);
      logProgress(progress, `planner backend=${String(process.env.OWA_AGENT_BACKEND || "auto").toLowerCase()}`);

      // Use vision for Claude backend, but reduce history to save context
      const backend = String(process.env.OWA_AGENT_BACKEND || "auto").toLowerCase();
      const useVision = backend === "claude" || backend === "anthropic" || backend === "auto";

      // When using vision, reduce history to save context space
      const historyForPrompt = useVision ? history.slice(-3) : history.slice(-8);
      const promptWithReducedHistory = buildPlannerPrompt(task, step, maxSteps, state, historyForPrompt, rules, false);

      const screenshot = useVision ? state.screenshot_b64 : "";

      if (debug) {
        process.stderr.write(`[agent] step=${step} screenshot_b64_length=${state.screenshot_b64?.length || 0} screenshot_path=${state.screenshot_path}\n`);
      }

      if (useVision && screenshot) {
        logProgress(progress, `using vision (screenshot size: ${screenshot.length} bytes)`);
      }

      const planRet = await runPlanner(promptWithReducedHistory, model, screenshot);
      if (!planRet.ok) {
        return toResult({
          success: false,
          exit_code: 4,
          screenshot: lastShotB64,
          message: `planner failed: ${planRet.error}`,
          meta: {
            requires_human: false,
            task,
            step,
            cdpUrl,
            url: state.url,
            screenshot_path: lastShotPath,
          },
        });
      }

      const decision = planRet.decision;
      logProgress(progress, `step ${step} action=${decision.action}`);
      if (debug) {
        process.stderr.write(`[agent] step=${step} action=${decision.action} reason=${decision.reason}\n`);
      }

      try {
        const execRet = await executeDecision(page, decision, state);
        history.push({
          step,
          action: decision.action,
          reason: decision.reason,
          note: execRet.note,
          url: state.url,
        });

        if (execRet.done) {
          if (execRet.requiresHuman) {
            requiresHuman = true;
          }
          const finalShot = await makeScreenshot(page, `agent-final-${step}`);
          lastShotPath = finalShot.filePath;
          lastShotB64 = finalShot.base64;
          return toResult({
            success: execRet.success,
            exit_code: execRet.success ? 0 : (execRet.requiresHuman ? 2 : 1),
            screenshot: lastShotB64, // Always return screenshot when paused
            message: execRet.result,
            meta: {
              requires_human: execRet.requiresHuman || false,
              task,
              steps: history,
              data: execRet.data || {},
              screenshot_path: lastShotPath,
              url: lastUrl,
            },
          });
        }

        // Small buffer to let any triggered actions settle
        await page.waitForTimeout(300);
      } catch (err) {
        const detail = normalizeText(err.message || err);
        history.push({
          step,
          action: decision.action,
          reason: decision.reason,
          error: detail,
          url: state.url,
        });

        appendRuleCorrection({
          ts: new Date().toISOString(),
          task,
          step,
          action: decision,
          error: detail,
          url: state.url,
        });
      }
    }

    return toResult({
      success: false,
      exit_code: 124,
      screenshot: lastShotB64,
      message: `max steps reached (${maxSteps})`,
      meta: {
        requires_human: false,
        task,
        steps: history,
        screenshot_path: lastShotPath,
        url: lastUrl,
      },
    });
  } catch (err) {
    return toResult({
      success: false,
      exit_code: 1,
      screenshot: lastShotB64,
      message: `agent failed: ${normalizeText(err.message || err)}`,
      meta: {
        requires_human: false,
        task,
        steps: history,
        error: String(err),
        screenshot_path: lastShotPath,
        url: lastUrl,
      },
    });
  } finally {
    if (page) {
      if (keepOpen) {
        // keep current tab untouched
      } else if (keepOpenOnHuman && requiresHuman) {
        try {
          await markHumanPauseTab(page);
        } catch (_err) {
          // ignore
        }
      } else {
        try {
          await page.close();
        } catch (_err) {
          // ignore
        }
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch (_err) {
        // ignore
      }
    }
  }
}

module.exports = {
  runAgentTask,
};
