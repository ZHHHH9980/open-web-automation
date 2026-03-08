#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { __internal } = require("../flows/plan/task-planner");

const { postProcessPlan } = __internal;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("task planner delegates author-latest rewriting to site adapters", () => {
  const patched = postProcessPlan(
    "去知乎看看数字生命卡兹克的最新文章",
    {
      intent: "search",
      target_site: "zhihu.com",
      keywords: ["数字生命卡兹克", "最新文章"],
      goal: "在知乎检索“数字生命卡兹克”的文章并获取其最新发布内容",
    },
    [
      { step: 1, action: "listen", reason: "listen" },
      { step: 2, action: "goto", url: "https://www.zhihu.com/search?q=foo", reason: "goto search" },
      { step: 3, action: "scrape_list", max_items: 10, reason: "scrape" },
      { step: 4, action: "done", reason: "done" },
    ]
  );

  assert.equal(patched.applied_by, "zhihu-author-latest");
  assert.equal(patched.plan.length, 6);
  assert.deepEqual(patched.analysis.subtypes, ["entity_lookup", "latest_content_fetch", "content_understanding"]);
  assert.equal(patched.analysis.primary_subtype, "latest_content_fetch");
});
