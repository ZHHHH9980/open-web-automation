#!/usr/bin/env node
"use strict";

const assert = require("assert");
const zhihuModule = require("../flows/site-modules/zhihu");
const { applySitePlanningAdapters } = require("../flows/plan/site-adapters");

const { extractZhihuAuthorIntent, buildZhihuAuthorLatestPlan } = zhihuModule.__internal.planning;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("extracts Zhihu author intent from latest article task", () => {
  const intent = extractZhihuAuthorIntent(
    "去知乎看看数字生命卡兹克的最新文章",
    { target_site: "zhihu.com", keywords: ["数字生命卡兹克", "最新文章"] }
  );

  assert.deepEqual(intent, {
    author: "数字生命卡兹克",
    latestOnly: true,
    maxItems: 1,
  });
});

test("builds author latest plan via zhihu adapter", () => {
  const plan = buildZhihuAuthorLatestPlan({ author: "数字生命卡兹克", latestOnly: true, maxItems: 1, selectionQuery: "去知乎看看数字生命卡兹克最新第二篇文章" });
  assert.equal(plan.length, 7);
  assert.equal(plan[1].url, "https://www.zhihu.com/search?q=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B");
  assert.equal(plan[3].url, "{{item_1_author_posts_url}}");
  assert.equal(plan[2].capture, false);
  assert.equal(plan[4].capture, false);
  assert.equal(plan[5].action, "select_list");
});

test("site adapter registry applies zhihu author flow", () => {
  const patched = applySitePlanningAdapters(
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
  assert.deepEqual(patched.analysis.keywords, ["数字生命卡兹克"]);
  assert.deepEqual(patched.analysis.subtypes, ["entity_lookup", "latest_content_fetch", "content_understanding"]);
  assert.equal(patched.analysis.primary_subtype, "latest_content_fetch");
  assert.equal(patched.plan[3].url, "{{item_1_author_posts_url}}");
  assert.equal(patched.plan[5].action, "select_list");
});
