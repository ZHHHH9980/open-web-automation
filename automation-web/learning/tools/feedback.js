#!/usr/bin/env node

"use strict";

const { recordFeedback } = require("./core/learning-system");

/**
 * 用户反馈收集工具
 *
 * 用法：
 *   node feedback.js --satisfied --rating 5 --comment "完美完成任务"
 *   node feedback.js --not-satisfied --rating 2 --comment "没找到正确内容"
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const feedback = {
    satisfied: false,
    rating: 3,
    comment: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--satisfied") {
      feedback.satisfied = true;
    } else if (arg === "--not-satisfied") {
      feedback.satisfied = false;
    } else if (arg === "--rating" && args[i + 1]) {
      feedback.rating = Math.max(1, Math.min(5, parseInt(args[i + 1], 10)));
      i++;
    } else if (arg === "--comment" && args[i + 1]) {
      feedback.comment = args[i + 1];
      i++;
    }
  }

  return feedback;
}

(async () => {
  try {
    const feedback = parseArgs();
    const taskId = Date.now(); // 简化版，实际应该从上次任务获取

    const record = recordFeedback(taskId, feedback);

    console.log("✓ 反馈已记录");
    console.log(JSON.stringify(record, null, 2));

    // 触发配置重新生成
    const { analyzeAndGenerateConfig } = require("./core/learning-system");
    const config = analyzeAndGenerateConfig();

    console.log("\n当前学习到的站点配置：");
    console.log(`总任务数: ${config.total_tasks}`);
    console.log(`满意任务数: ${config.satisfied_tasks}`);
    console.log(`已沉淀站点: ${config.sites.length}`);

    if (config.sites.length > 0) {
      console.log("\n站点列表：");
      config.sites.forEach(site => {
        console.log(`  - ${site.domain} (优先级: ${site.priority}, 成功次数: ${site.stats.successCount})`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error("反馈记录失败:", err.message);
    process.exit(1);
  }
})();
