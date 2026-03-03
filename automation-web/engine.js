"use strict";

const { toResult } = require("./core/result");
const { parseStructuredTask } = require("./core/input");
const { connectBrowser, getAutomationPage } = require("./core/browser");
const { runGoogleSearch } = require("./workflows/google");
const {
  runZhihuFollowLookup,
  runZhihuSearch,
  runZhihuLatestAnswer,
  runZhihuSearchTopAnswer,
  runZhihuFollowNthPost,
} = require("./workflows/zhihu");
const { runXhsSearch, runXhsPublish } = require("./workflows/xiaohongshu");

const ROUTES = {
  google: {
    search: runGoogleSearch,
  },
  zhihu: {
    follow_lookup: runZhihuFollowLookup,
    search: runZhihuSearch,
    latest_answer: runZhihuLatestAnswer,
    search_top_answer: runZhihuSearchTopAnswer,
    follow_nth_post: runZhihuFollowNthPost,
  },
  xiaohongshu: {
    search_notes: runXhsSearch,
    publish_note: runXhsPublish,
  },
};

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`task_timeout_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runWebTask(rawTask, opts = {}) {
  const parsedRet = parseStructuredTask(rawTask);
  if (!parsedRet.ok) {
    return toResult({
      success: false,
      exit_code: 3,
      message: parsedRet.error,
      meta: {
        parsed: parsedRet.parsed || null,
        task: parsedRet.raw || String(rawTask || ""),
        requires_human: false,
      },
    });
  }

  const cmd = parsedRet.parsed;
  const taskRaw = parsedRet.raw;
  const cdpUrl = opts.cdpUrl || process.env.WEB_CDP_URL || "http://127.0.0.1:9222";
  const timeoutMs = Number(process.env.WEB_TASK_TIMEOUT_MS || 180000);
  const keepOpenByEnv = process.env.WEB_KEEP_OPEN === "1";
  const keepOpenOnHuman = process.env.WEB_KEEP_OPEN_ON_HUMAN === "1";

  const fn = ROUTES[cmd.site] && ROUTES[cmd.site][cmd.action];
  if (!fn) {
    return toResult({
      success: false,
      exit_code: 3,
      message: `未实现的任务类型: ${cmd.site}/${cmd.action}`,
      meta: { cmd, task: taskRaw, requires_human: false },
    });
  }

  let browser;
  let page;
  let result;

  try {
    const { browser: b, context } = await connectBrowser(cdpUrl);
    browser = b;
    page = await getAutomationPage(context);
    page.setDefaultTimeout(15000);

    result = await withTimeout(fn(page, cmd), timeoutMs);
    return result;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.startsWith("task_timeout_")) {
      result = toResult({
        success: false,
        exit_code: 124,
        message: `任务超时（>${Math.round(timeoutMs / 1000)}s），已终止当前任务。`,
        meta: { cmd, task: taskRaw, cdpUrl, error: msg, requires_human: false },
      });
      return result;
    }

    result = toResult({
      success: false,
      exit_code: 1,
      message: `网页自动化执行失败: ${msg}`,
      meta: { cmd, task: taskRaw, cdpUrl, error: String(err), requires_human: false },
    });
    return result;
  } finally {
    const keepOpenForHuman =
      keepOpenByEnv ||
      (keepOpenOnHuman && Boolean(result && result.meta && result.meta.requires_human));

    if (page && !keepOpenForHuman) {
      try {
        await page.close();
      } catch (_err) {
        // ignore
      }
    }

    if (browser) {
      try {
        if (!keepOpenForHuman) {
          await browser.close();
        }
      } catch (_err) {
        // ignore
      }
    }
  }
}

module.exports = {
  runWebTask,
};
