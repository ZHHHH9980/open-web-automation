#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { generateConclusion } = require("../flows/finish/conclusion-generator");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((error) => {
      console.error(`✗ ${name}`);
      throw error;
    });
}

test("builds focused summary and filters low-value emotional lines for latest content tasks", async () => {
  const conclusion = await generateConclusion([
    {
      parsed: {
        items: [{
          title: "GPT-5.4深夜发布，最适合OpenClaw的天选模型登场了。",
          author: "数字生命卡兹克",
          content_summary: "深夜凌晨2点，我刚准备睡觉。然后，GPT-5.4，突然发布。",
          article_content: "深夜凌晨2点，我刚准备睡觉。然后，GPT-5.4，突然发布。作者认为它很适合作为 OpenClaw 的首选模型。核心原因是代码能力、世界知识和多模态理解都很重要。Claude 综合能力强，但成本太高。",
          detail_url: "https://zhuanlan.zhihu.com/p/1",
          publish_time: 1772769601000,
        }]
      }
    }
  ], "去知乎看看数字生命卡兹克的最新文章", null, {
    taskAnalysis: {
      intent: "search",
      target_site: "zhihu.com",
      subtypes: ["entity_lookup", "latest_content_fetch", "content_understanding"],
      primary_subtype: "latest_content_fetch",
    },
  });

  assert.match(conclusion.summary, /已定位到数字生命卡兹克的最新内容/);
  assert.match(conclusion.summary, /重点在于/);
  assert.ok(conclusion.keyPoints.some((item) => /最新标题/.test(item)));
  assert.ok(conclusion.keyPoints.some((item) => /代码能力/.test(item)));
  assert.ok(conclusion.keyPoints.some((item) => /Claude 综合能力强，但成本太高/.test(item)));
  assert.ok(conclusion.keyPoints.every((item) => !/深夜凌晨2点|刚准备睡觉/.test(item)));
  assert.deepEqual(conclusion.links, ["https://zhuanlan.zhihu.com/p/1"]);
});

test("builds discovery-style summary for search discovery tasks", async () => {
  const conclusion = await generateConclusion([
    {
      parsed: {
        items: [
          {
            title: "AI Agent 入门指南",
            author: "作者A",
            content_summary: "介绍 AI Agent 的基本概念与入门路径。",
            article_content: "介绍 AI Agent 的基本概念与入门路径。",
            detail_url: "https://example.com/a",
            publish_time: 1772769601000,
          },
          {
            title: "AI Agent 框架对比",
            author: "作者B",
            content_summary: "对比常见 Agent 框架的优缺点。",
            article_content: "对比常见 Agent 框架的优缺点。",
            detail_url: "https://example.com/b",
            publish_time: 1772769500000,
          },
        ]
      }
    }
  ], "去知乎搜索 AI Agent，返回前 5 条结果", null, {
    taskAnalysis: {
      intent: "search",
      target_site: "zhihu.com",
      subtypes: ["search_discovery"],
      primary_subtype: "search_discovery",
    },
  });

  assert.match(conclusion.summary, /共整理 2 条候选结果/);
  assert.ok(conclusion.keyPoints[0].startsWith("候选1："));
  assert.ok(conclusion.keyPoints[1].startsWith("候选2："));
});
