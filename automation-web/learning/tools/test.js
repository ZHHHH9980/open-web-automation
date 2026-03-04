#!/usr/bin/env node

"use strict";

/**
 * 学习系统功能回归测试
 */

const { recordExecution, getActiveConfig, guessSeedUrl, isManagedUrl } = require("../system");

console.log("🧪 学习系统功能回归测试\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  错误: ${err.message}`);
    failed++;
  }
}

// 测试 1: 记录执行
test("recordExecution - 记录成功任务", () => {
  const record = recordExecution({
    task: "测试任务",
    finalUrl: "https://example.com/",
    success: true,
    steps: [{action: "goto"}, {action: "done"}],
    duration: 5000,
    requiresHuman: false
  });

  if (!record.inferredSatisfaction) throw new Error("应该推断为满意");
  if (record.confidenceScore < 0.6) throw new Error("置信度应该 >= 0.6");
});

// 测试 2: 记录失败任务
test("recordExecution - 记录失败任务", () => {
  const record = recordExecution({
    task: "测试失败任务",
    finalUrl: "https://example.com/",
    success: false,
    steps: [{action: "goto"}, {action: "fail"}],
    duration: 3000,
    requiresHuman: false
  });

  if (record.inferredSatisfaction) throw new Error("应该推断为不满意");
});

// 测试 3: 获取配置
test("getActiveConfig - 获取当前配置", () => {
  const config = getActiveConfig();

  if (!config.sites) throw new Error("配置应该有 sites 字段");
  if (!Array.isArray(config.sites)) throw new Error("sites 应该是数组");

  // 应该至少有 Google 作为默认
  const hasGoogle = config.sites.some(s => s.domain.includes("google.com"));
  if (!hasGoogle) throw new Error("应该包含 Google 作为默认站点");
});

// 测试 4: URL 猜测 - 包含 URL
test("guessSeedUrl - 提取任务中的 URL", () => {
  const url = guessSeedUrl("打开 https://example.com/test");
  if (url !== "https://example.com/test") {
    throw new Error(`期望 https://example.com/test，实际 ${url}`);
  }
});

// 测试 5: URL 猜测 - 默认 Google
test("guessSeedUrl - 未知任务默认 Google", () => {
  const url = guessSeedUrl("随便搜索点什么");
  if (!url.includes("google.com")) {
    throw new Error(`期望包含 google.com，实际 ${url}`);
  }
});

// 测试 6: URL 管理判断
test("isManagedUrl - 识别特殊 URL", () => {
  if (!isManagedUrl("about:blank")) throw new Error("about:blank 应该被管理");
  if (!isManagedUrl("chrome://newtab")) throw new Error("chrome://newtab 应该被管理");
});

// 测试 7: 关键词提取
test("extractFeatures - 中文关键词提取", () => {
  const record = recordExecution({
    task: "搜索知乎上关于 AI 的讨论",
    finalUrl: "https://www.zhihu.com/",
    success: true,
    steps: [{action: "done"}],
    duration: 5000,
    requiresHuman: false
  });

  const keywords = record.features.keywords;
  const hasZhihu = keywords.some(k => k.includes("知乎"));
  const hasAI = keywords.some(k => k.toLowerCase() === "ai");

  if (!hasZhihu) throw new Error("应该提取出'知乎'关键词");
  if (!hasAI) throw new Error("应该提取出'ai'关键词");
});

// 输出结果
console.log(`\n${"=".repeat(60)}`);
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("✅ 所有测试通过！");
  process.exit(0);
}
