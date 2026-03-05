"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const { connectBrowser, getAutomationPage, makeScreenshot, markHumanPauseTab } = require("./core/browser");
const { toResult } = require("./core/result");
const { guessSeedUrl: guessSeedUrlFromLearning } = require("./learning/system");
const { LoopDetector } = require("./core/loop-detector");
const { runPlanner } = require("./planners");
const { collectPageState } = require("./core/state-collector");
const { buildPlannerPrompt } = require("./core/prompt-builder");
const { executeDecision } = require("./core/executor");
const { generatePlan, canExecutePlan, replan } = require("./core/task-planner");
const { generateConclusion } = require("./core/conclusion-generator");

const ROOT = path.resolve(__dirname, "..");
const RULES_DIR = path.join(ROOT, "adapter", "rules");
const RULES_FILE = path.join(RULES_DIR, "auto-corrections.jsonl");

// Generate unique task ID for this execution
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get extraction file path for this task
function getExtractionFilePath(taskId) {
  return path.join(os.tmpdir(), `owa_extract_${taskId}.txt`);
}

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
  const usePlanningMode = process.env.OWA_AGENT_PLANNING_MODE === "1";
  const includeScreenshot = process.env.OWA_INCLUDE_SCREENSHOT === "1" || opts.includeScreenshot; // 新增：screenshot 可选
  const startedAt = Date.now();

  let browser;
  let page;
  let lastShotPath = "";
  let lastShotB64 = "";
  let lastUrl = "";
  const history = [];
  const taskId = generateTaskId(); // Unique ID for this task
  const extractionFile = getExtractionFilePath(taskId); // File to store extracted content
  let extractedCount = 0; // Counter for extracted items
  let requiresHuman = false;
  const loopDetector = new LoopDetector();

  try {
    const conn = await connectBrowser(cdpUrl);
    browser = conn.browser;
    page = await getAutomationPage(conn.context);
    page.setDefaultTimeout(12000);
    logProgress(progress, `task started: ${task}`);

    // Planning Mode: Generate complete plan first
    let executionPlan = null;
    if (usePlanningMode) {
      logProgress(progress, "generating execution plan...");

      // Get initial state
      const initialState = await collectPageState(page, 0, candidateLimit);
      const planResult = await generatePlan(task, initialState, maxSteps);

      if (!planResult.ok) {
        return toResult({
          success: false,
          exit_code: 4,
          message: `planning failed: ${planResult.error}`,
          meta: { requires_human: false, task },
        });
      }

      executionPlan = planResult.plan;
      logProgress(progress, `plan generated (${executionPlan.length} steps):`);
      executionPlan.forEach((step, idx) => {
        const actionDesc = step.action === "type" ? `${step.action} "${step.text}"` :
                          step.action === "goto" ? `${step.action} ${step.url}` :
                          step.action;
        logProgress(progress, `  ${idx + 1}. ${actionDesc} - ${step.reason}`);
      });
    }

    for (let step = 1; step <= maxSteps; step += 1) {
      if (Date.now() - startedAt > timeoutMs) {
        return toResult({
          success: false,
          exit_code: 124,
          screenshot: includeScreenshot ? lastShotB64 : "",
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
      lastUrl = state.url || lastUrl;

      const screenshotSize = state.screenshot_b64 ? state.screenshot_b64.length : 0;
      loopDetector.record({
        screenshot_size: screenshotSize,
        url: state.url,
      });

      if (debug) {
        process.stderr.write(`[agent] step=${step} screenshot size: ${screenshotSize} bytes\n`);
      }

      logProgress(progress, `step ${step}/${maxSteps} url=${state.url || "about:blank"} planning...`);

      if (step === 1 && !String(state.url || "").startsWith("about:blank")) {
        logProgress(progress, `cleaning browser state from ${state.url}`);
        await page.goto("about:blank");
        await page.waitForTimeout(300);

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
        loopDetector.reset();
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
        loopDetector.reset();
        continue;
      }

      const rules = loadRecentRules(10);
      const backend = String(process.env.OWA_AGENT_BACKEND || "auto").toLowerCase();
      const useVision = backend === "claude" || backend === "anthropic" || backend === "auto";

      let decision;

      // Planning Mode: Use pre-generated plan
      if (usePlanningMode && executionPlan && executionPlan.length > 0) {
        const plannedAction = executionPlan.shift(); // Get next planned action

        // Validate if action can be executed
        if (canExecutePlan(plannedAction, state)) {
          decision = plannedAction;
          logProgress(progress, `executing planned step ${step}/${maxSteps}`);
        } else {
          // Replan if action cannot be executed
          logProgress(progress, `replanning from step ${step} (action not executable)`);
          const replanResult = await replan(task, state, history, executionPlan);

          if (!replanResult.ok) {
            return toResult({
              success: false,
              exit_code: 4,
              screenshot: includeScreenshot ? lastShotB64 : "",
              message: `replanning failed: ${replanResult.error}`,
              meta: { requires_human: false, task, step, url: state.url },
            });
          }

          executionPlan = replanResult.plan;
          decision = executionPlan.shift();
        }
      } else {
        // Reactive Mode: Ask LLM for next action
        const historyForPrompt = useVision ? history.slice(-3) : history.slice(-8);
        const prompt = buildPlannerPrompt(task, step, maxSteps, state, historyForPrompt, rules, false, extractedCount);
        const screenshot = useVision ? state.screenshot_b64 : "";

        if (debug) {
          process.stderr.write(`[agent] step=${step} screenshot_b64_length=${state.screenshot_b64?.length || 0} screenshot_path=${state.screenshot_path}\n`);
        }

        const planRet = await runPlanner(prompt, model, screenshot);
        if (!planRet.ok) {
          return toResult({
            success: false,
            exit_code: 4,
            screenshot: includeScreenshot ? lastShotB64 : "",
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

        decision = planRet.decision;
      }

      // Always show agent's reasoning (not just in debug mode)
      const actionDesc = decision.action === "type" ? `${decision.action} "${decision.text}"` :
                        decision.action === "goto" ? `${decision.action} ${decision.url}` :
                        decision.action;

      logProgress(progress, `[${step}/${maxSteps}] ${actionDesc}`);

      // Show reasoning chain
      if (decision.reason) {
        logProgress(progress, `  └─ reason: ${decision.reason}`);
      }

      // Show key parameters
      if (decision.selector) {
        logProgress(progress, `  └─ selector: ${decision.selector}`);
      }
      if (decision.target_id) {
        logProgress(progress, `  └─ target_id: ${decision.target_id}`);
      }
      if (decision.label) {
        logProgress(progress, `  └─ label: ${decision.label}`);
      }

      // Debug mode: even more detailed info
      if (debug) {
        process.stderr.write(`\n[agent] ===== Step ${step}/${maxSteps} =====\n`);
        process.stderr.write(`[agent] Full decision: ${JSON.stringify(decision, null, 2)}\n`);
      }

      try {
        const execRet = await executeDecision(page, decision, state, debug);

        // Store extracted data to file
        if (decision.action === "extract" && execRet.data) {
          extractedCount++;
          const extractionEntry = `--- Extract #${extractedCount} (${execRet.data.label || "unlabeled"}) ---\n${execRet.data.content}\n${
            execRet.data.full_length > execRet.data.content.length
              ? `[Truncated, full length: ${execRet.data.full_length} chars]\n`
              : ""
          }\n`;

          fs.appendFileSync(extractionFile, extractionEntry, "utf-8");

          if (debug) {
            process.stderr.write(`[agent] stored extraction #${extractedCount}: ${execRet.data.label}\n`);
            process.stderr.write(`[agent] extraction file: ${extractionFile}\n`);
          }
        }

        history.push({
          step,
          action: decision.action,
          reason: decision.reason,
          note: execRet.note,
          url: state.url,
        });

        // Check if task is done BEFORE loop detection
        if (execRet.done) {
          if (execRet.requiresHuman) {
            requiresHuman = true;
          }
          const finalShot = await makeScreenshot(page, `agent-final-${step}`);
          lastShotPath = finalShot.filePath;
          lastShotB64 = finalShot.base64;

          const finalUrl = page.url();

          // Generate conclusion if we have extracted data
          let conclusion = null;
          if (extractedCount > 0 && fs.existsSync(extractionFile)) {
            logProgress(progress, "generating conclusion from extracted data");
            try {
              conclusion = await generateConclusion(extractionFile, task, model, { debugMode: opts.debugMode });
            } catch (err) {
              logProgress(progress, `conclusion generation failed: ${err.message}`);
            }
          }

          const extractDom = process.env.OWA_EXTRACT_DOM === "1" || opts.extractDom;
          let domData = {};

          if (extractDom) {
            logProgress(progress, "extracting DOM data");
            try {
              const fullText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
              domData = { fullText: fullText.slice(0, 10000) };
            } catch (err) {
              // ignore
            }
          }

          return toResult({
            success: execRet.success,
            exit_code: execRet.success ? 0 : (execRet.requiresHuman ? 2 : 1),
            screenshot: includeScreenshot ? lastShotB64 : "",
            message: execRet.result,
            meta: {
              requires_human: execRet.requiresHuman || false,
              task,
              steps: history,
              data: execRet.data || {},
              extracted_count: extractedCount,
              extraction_file: extractedCount > 0 ? extractionFile : null,
              conclusion,
              screenshot_path: includeScreenshot ? lastShotPath : "",
              url: finalUrl,
              dom_data: extractDom ? domData : undefined,
            },
          });
        }

        // Only check loop if task is not done
        loopDetector.record({
          action: decision.action,
          modal_mode: state.site_hints?.modal_mode || false, // 传递弹窗模式信息
        });

        const loopCheck = loopDetector.detectLoop();
        if (loopCheck.isLoop) {
          logProgress(progress, `loop detected: ${loopCheck.reasons.join(', ')}`);

          try {
            const finalShot = await makeScreenshot(page, 'loop-detected-final');
            lastShotPath = finalShot.filePath;
            lastShotB64 = finalShot.base64;
          } catch (_err) {
            // ignore
          }

          // Build a more helpful error message
          let errorMessage = `Loop detected: ${loopCheck.reasons.join(', ')}`;
          if (extractedCount > 0) {
            errorMessage += `\n\nPartially completed: Extracted ${extractedCount} item(s) before loop.`;
            errorMessage += `\nExtraction file: ${extractionFile}`;
          }
          errorMessage += `\n\nLast action: ${history[history.length - 1]?.action || 'unknown'}`;
          errorMessage += `\nSuggestion: The task may need manual intervention or the page structure changed.`;

          return toResult({
            success: false,
            exit_code: 125,
            screenshot: includeScreenshot ? lastShotB64 : "",
            message: errorMessage,
            meta: {
              requires_human: false,
              task,
              steps: history,
              extracted_count: extractedCount,
              extraction_file: extractedCount > 0 ? extractionFile : null,
              screenshot_path: lastShotPath,
              url: lastUrl,
              loop_reasons: loopCheck.reasons,
            },
          });
        }

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
      screenshot: includeScreenshot ? lastShotB64 : "",
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
      screenshot: includeScreenshot ? lastShotB64 : "",
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
