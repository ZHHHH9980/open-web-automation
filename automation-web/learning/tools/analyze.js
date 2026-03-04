#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const PATTERNS_FILE = path.join(__dirname, "..", "data", "patterns.jsonl");

function loadJsonLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .split("\n")
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (_err) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function analyze() {
  const patterns = loadJsonLines(PATTERNS_FILE);

  if (patterns.length === 0) {
    console.log("📊 学习系统分析报告");
    console.log("=" .repeat(60));
    console.log("\n暂无数据。开始使用系统后，数据会自动记录。\n");
    return;
  }

  // 基础统计
  const totalTasks = patterns.length;
  const successTasks = patterns.filter(p => p.success).length;
  const satisfiedTasks = patterns.filter(p => p.inferredSatisfaction && p.confidenceScore >= 0.7).length;
  const avgDuration = patterns.reduce((sum, p) => sum + (p.duration || 0), 0) / totalTasks;
  const avgSteps = patterns.reduce((sum, p) => sum + (p.steps?.length || 0), 0) / totalTasks;

  // 域名统计
  const domainStats = {};
  patterns.forEach(p => {
    const domain = p.features?.domain;
    if (!domain) return;

    if (!domainStats[domain]) {
      domainStats[domain] = {
        total: 0,
        success: 0,
        satisfied: 0,
        avgDuration: 0,
        totalDuration: 0,
      };
    }

    const stats = domainStats[domain];
    stats.total += 1;
    if (p.success) stats.success += 1;
    if (p.inferredSatisfaction && p.confidenceScore >= 0.7) stats.satisfied += 1;
    stats.totalDuration += p.duration || 0;
  });

  Object.values(domainStats).forEach(stats => {
    stats.avgDuration = Math.round(stats.totalDuration / stats.total);
    stats.successRate = ((stats.success / stats.total) * 100).toFixed(1);
    stats.satisfactionRate = ((stats.satisfied / stats.total) * 100).toFixed(1);
  });

  // 排序
  const topDomains = Object.entries(domainStats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  // 输出报告
  console.log("\n📊 学习系统分析报告");
  console.log("=".repeat(60));
  console.log(`\n📈 总体统计`);
  console.log(`  总任务数:     ${totalTasks}`);
  console.log(`  成功任务:     ${successTasks} (${((successTasks / totalTasks) * 100).toFixed(1)}%)`);
  console.log(`  满意任务:     ${satisfiedTasks} (${((satisfiedTasks / totalTasks) * 100).toFixed(1)}%)`);
  console.log(`  平均耗时:     ${(avgDuration / 1000).toFixed(1)} 秒`);
  console.log(`  平均步骤数:   ${avgSteps.toFixed(1)} 步`);

  console.log(`\n🌐 热门站点 (Top ${topDomains.length})`);
  console.log("-".repeat(60));
  console.log("  排名  域名                    访问  成功率  满意率  平均耗时");
  console.log("-".repeat(60));

  topDomains.forEach(([domain, stats], idx) => {
    const rank = `${idx + 1}.`.padEnd(5);
    const domainStr = domain.padEnd(22);
    const total = `${stats.total}次`.padEnd(6);
    const successRate = `${stats.successRate}%`.padEnd(8);
    const satisfactionRate = `${stats.satisfactionRate}%`.padEnd(8);
    const avgDur = `${(stats.avgDuration / 1000).toFixed(1)}s`;

    console.log(`  ${rank} ${domainStr} ${total} ${successRate} ${satisfactionRate} ${avgDur}`);
  });

  // 沉淀建议
  const readyToSettle = Object.entries(domainStats)
    .filter(([_, stats]) => stats.satisfied >= 3)
    .sort((a, b) => b[1].satisfied - a[1].satisfied);

  if (readyToSettle.length > 0) {
    console.log(`\n✅ 已沉淀站点 (满意次数 >= 3)`);
    console.log("-".repeat(60));
    readyToSettle.forEach(([domain, stats]) => {
      const priority = stats.satisfied * 10;
      console.log(`  - ${domain.padEnd(25)} 优先级: ${priority.toString().padEnd(4)} (${stats.satisfied} 次满意)`);
    });
  }

  // 问题站点
  const problematicDomains = Object.entries(domainStats)
    .filter(([_, stats]) => stats.total >= 3 && parseFloat(stats.successRate) < 50)
    .sort((a, b) => parseFloat(a[1].successRate) - parseFloat(b[1].successRate));

  if (problematicDomains.length > 0) {
    console.log(`\n⚠️  问题站点 (成功率 < 50%)`);
    console.log("-".repeat(60));
    problematicDomains.forEach(([domain, stats]) => {
      console.log(`  - ${domain.padEnd(25)} 成功率: ${stats.successRate}% (${stats.success}/${stats.total})`);
    });
  }

  // 最近任务
  const recentTasks = patterns.slice(-5).reverse();
  console.log(`\n📝 最近 ${recentTasks.length} 次任务`);
  console.log("-".repeat(60));
  recentTasks.forEach(task => {
    const status = task.success ? "✓" : "✗";
    const confidence = task.confidenceScore ? `(${(task.confidenceScore * 100).toFixed(0)}%)` : "";
    const domain = task.features?.domain || "unknown";
    const duration = `${(task.duration / 1000).toFixed(1)}s`;
    const timestamp = new Date(task.timestamp).toLocaleString("zh-CN");

    console.log(`  ${status} ${domain.padEnd(20)} ${duration.padEnd(8)} ${confidence.padEnd(6)} ${timestamp}`);
  });

  console.log("\n" + "=".repeat(60));
  console.log("💡 提示: 使用 'cat learning/data/patterns.jsonl | jq .' 查看原始数据\n");
}

// 运行分析
analyze();
