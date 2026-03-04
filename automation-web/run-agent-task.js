#!/usr/bin/env node

"use strict";

const { runAgentTask } = require("./llm-agent");
const { recordExecution } = require("./learning/system");

function writeJsonLine(obj) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
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

    const result = await runAgentTask(input, opts);

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
    process.exitCode = result.exit_code || (result.success ? 0 : 1);
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
    process.exitCode = 1;
  }
})();

