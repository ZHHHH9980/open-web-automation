#!/usr/bin/env node

"use strict";

const { runAgentTask } = require("./llm-agent");
const { recordExecution } = require("./learning/system");
const { loadSiteConfig, executeSearch } = require("./config/manager");
const { loadBrowserConfig } = require("./config/browser-config");
const { shouldAskFeedback, askFeedback } = require("./tools/smart-feedback");

function writeJsonLine(obj) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 从任务中提取站点名
 */
function extractSiteName(task) {
  const patterns = [
    /打开(.+?)[，,、]/,
    /搜索(.+?)[，,、]/,
    /在(.+?)[上中]/,
    /(.+?)上/,
    /(.+?)搜索/
  ];

  for (const pattern of patterns) {
    const match = task.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * 从任务中提取搜索词（智能提取）
 */
function extractSearchQuery(task) {
  const match = task.match(/搜索\s*(.+?)(?:[，,。]|$)/);
  if (!match) return null;

  let query = match[1].trim();

  // 去掉常见的后缀
  const suffixes = [
    /\s*的价格$/,
    /\s*多少钱$/,
    /\s*怎么样$/,
    /\s*好不好$/,
    /\s*在哪里$/,
    /\s*在哪$/,
    /\s*价格$/
  ];

  for (const suffix of suffixes) {
    query = query.replace(suffix, '');
  }

  return query.trim();
}

/**
 * 判断是否是搜索任务
 */
function isSearchTask(task) {
  return /搜索|查找|找/.test(task);
}

(async () => {
  try {
    const args = process.argv.slice(2);
    const opts = {};
    const taskParts = [];

    for (const arg of args) {
      if (arg.startsWith("--debug-mode=")) {
        opts.debugMode = arg.split("=")[1] === "true";
      } else {
        taskParts.push(arg);
      }
    }

    const input = taskParts.join(" ");
    const startTime = Date.now();

    // 加载浏览器配置
    const browserConfig = loadBrowserConfig();
    const cdpUrl = opts.cdpUrl || browserConfig?.cdpUrl || process.env.WEB_CDP_URL || "http://127.0.0.1:9222";

    // 尝试使用配置（快速路径）
    const siteName = extractSiteName(input);
    const config = siteName ? loadSiteConfig(siteName) : null;

    let result;

    if (config && isSearchTask(input)) {
      // 使用配置执行（快速路径）
      console.error(`[config] 检测到已配置站点: ${siteName}`);

      // 使用 Phase 1 分析任务，提取搜索词
      const { runAnalysisPhase } = require("./prompts/analysis");
      const { connectBrowser, getAutomationPage } = require("./core/browser");

      try {
        const conn = await connectBrowser(cdpUrl);
        const page = await getAutomationPage(conn.context);

        // Phase 1: 分析任务
        console.error(`[config] 使用 Agent 分析任务...`);
        const agentPlan = await runAnalysisPhase(input);

        if (!agentPlan) {
          console.error('[config] 任务分析失败，回退到完全动态模式');
          result = await runAgentTask(input, opts);
        } else {
          // 从 agentPlan 中提取搜索词
          const query = agentPlan.steps && agentPlan.steps.length > 0
            ? agentPlan.steps.find(s => s.includes('搜索'))?.replace(/搜索\s*/, '') || extractSearchQuery(input)
            : extractSearchQuery(input);

          console.error(`[config] 搜索词: ${query}`);
          console.error(`[config] 使用配置执行搜索（成本: 1 次 LLM 分析 + 0 次截图）`);

          await page.goto(config.url);
          await page.waitForLoadState('networkidle');

          const searchResult = await executeSearch(page, config, query);

          if (searchResult.ok) {
            const duration = Date.now() - startTime;
            console.error(`[config] 搜索成功，耗时: ${duration}ms`);

            result = {
              success: true,
              exit_code: 0,
              message: "task completed using config",
              has_screenshot: false,
              screenshot: "",
              timestamp: new Date().toISOString(),
              meta: {
                requires_human: false,
                task: input,
                url: page.url(),
                steps: searchResult.steps,
                used_config: true,
                config_site: siteName,
                agent_plan: agentPlan
              }
            };
          } else {
            console.error(`[config] 配置执行失败: ${searchResult.error}`);
            console.error('[config] 回退到完全动态模式');
            result = await runAgentTask(input, opts);
          }
        }
      } catch (err) {
        console.error(`[config] 执行出错: ${err.message}`);
        console.error('[config] 回退到完全动态模式');
        result = await runAgentTask(input, opts);
      }
    } else {
      // 完全动态模式
      if (siteName && isSearchTask(input)) {
        console.error(`[config] 站点 "${siteName}" 未配置`);
        console.error('[config] 使用完全动态模式（成本: ~$0.30）');
        console.error(`[config] 提示: 执行 3-5 次后运行 "node tools/config-site.js \\"${input}\\"" 生成配置`);
      }

      result = await runAgentTask(input, opts);
    }

    const duration = Date.now() - startTime;

    // 自动记录执行结果（无需用户反馈）
    try {
      const record = recordExecution({
        task: input,
        finalUrl: result.meta?.url || "",
        success: result.success,
        steps: result.meta?.steps || [],
        duration,
        requiresHuman: result.meta?.requires_human || false,
      });

      // 调试模式下输出学习信息
      if (opts.debugMode || process.env.OWA_LEARNING_DEBUG === "1") {
        process.stderr.write(`\n[learning] 满意度推断: ${record.inferredSatisfaction ? "✓" : "✗"} (置信度: ${(record.confidenceScore * 100).toFixed(0)}%)\n`);
        process.stderr.write(`[learning] 原因: ${record.confidenceReasons.join(", ")}\n`);
      }
    } catch (err) {
      // 学习系统失败不影响主流程
      if (opts.debugMode) {
        process.stderr.write(`[learning] 记录失败: ${err.message}\n`);
      }
    }

    await writeJsonLine(result);

    // 智能反馈：只在完全动态模式且可能有问题时询问
    if (shouldAskFeedback(result)) {
      console.error('\n[feedback] 检测到任务使用了完全动态模式（视觉识别）');
      console.error('[feedback] 为了提高系统准确性，请确认任务是否成功\n');

      const taskData = {
        task: input,
        success: result.success,
        duration,
        steps: result.meta?.steps || [],
        timestamp: result.timestamp,
        url: result.meta?.url,
        screenshot_path: result.meta?.screenshot_path
      };

      // 获取 page 对象（如果还在连接中）
      let page = null;
      try {
        const { connectBrowser, getAutomationPage } = require("./core/browser");
        const conn = await connectBrowser(cdpUrl);
        page = await getAutomationPage(conn.context);
      } catch (err) {
        console.error('[feedback] 无法连接到浏览器');
      }

      const feedback = await askFeedback(taskData, page);

      // 如果用户提供了纠正线索，继续执行
      if (feedback.needCorrection && feedback.correction) {
        console.error('\n[correction] 根据用户线索继续执行...');
        console.error(`[correction] 线索: ${feedback.correction.hint}\n`);

        const { buildCorrectionPrompt } = require("./tools/interactive-correction");
        const correctionPrompt = buildCorrectionPrompt(input, feedback.correction, taskData);

        // 继续执行任务（最多再执行 15 步）
        const correctionResult = await runAgentTask(correctionPrompt, opts);

        if (correctionResult.success) {
          console.error('\n[correction] ✓ 任务成功完成！');
        } else {
          console.error('\n[correction] ✗ 纠正后仍然失败');
        }

        process.exit(correctionResult.exit_code || (correctionResult.success ? 0 : 1));
      }
    } else if (result.meta?.used_config) {
      console.error('\n[config] 任务使用配置模式完成，无需反馈');
    }

    process.exit(result.exit_code || (result.success ? 0 : 1));
  } catch (err) {
    await writeJsonLine({
      success: false,
      message: `agent runtime exception: ${err.message || err}`,
      has_screenshot: false,
      screenshot: "",
      exit_code: 1,
      timestamp: new Date().toISOString(),
      meta: { error: String(err), requires_human: false },
    });
    process.exit(1);
  }
})();

