#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { normalizeTaskAnalysis } = require("../flows/plan/task-analysis");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("infers browse_feed for casual browsing tasks", () => {
  const analysis = normalizeTaskAnalysis("帮我去知乎刷5篇文章", {
    intent: "browse",
    target_site: "zhihu.com",
    goal: "在知乎随便看看几篇文章",
  });

  assert.equal(analysis.intent, "browse");
  assert.deepEqual(analysis.subtypes, ["browse_feed"]);
  assert.equal(analysis.primary_subtype, "browse_feed");
});

test("infers search_discovery for topic search tasks", () => {
  const analysis = normalizeTaskAnalysis("去知乎搜索 AI Agent，返回前 5 条结果", {
    intent: "search",
    target_site: "zhihu.com",
    keywords: ["AI Agent"],
    goal: "搜索 AI Agent 相关结果并返回候选项",
  });

  assert.equal(analysis.intent, "search");
  assert.deepEqual(analysis.subtypes, ["search_discovery"]);
  assert.equal(analysis.primary_subtype, "search_discovery");
});

test("infers entity latest and understanding for latest author content", () => {
  const analysis = normalizeTaskAnalysis("去知乎看看数字生命卡兹克的最新文章", {
    intent: "search",
    target_site: "zhihu.com",
    keywords: ["数字生命卡兹克", "最新文章"],
    goal: "在知乎检索“数字生命卡兹克”的文章并获取其最新发布内容",
  }, [
    { step: 1, action: "listen" },
    { step: 2, action: "goto", url: "https://www.zhihu.com/search?q=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B" },
    { step: 3, action: "scrape_list", max_items: 1 },
  ]);

  assert.deepEqual(analysis.subtypes, ["entity_lookup", "latest_content_fetch", "content_understanding"]);
  assert.equal(analysis.primary_subtype, "latest_content_fetch");
});

test("infers comparison_or_review for comparison tasks", () => {
  const analysis = normalizeTaskAnalysis("对比 Claude 和 GPT 哪个更适合写代码", {
    intent: "search",
    keywords: ["Claude", "GPT", "写代码"],
    goal: "比较两个模型写代码的表现",
  });

  assert.ok(analysis.subtypes.includes("comparison_or_review"));
  assert.equal(analysis.primary_subtype, "comparison_or_review");
});
