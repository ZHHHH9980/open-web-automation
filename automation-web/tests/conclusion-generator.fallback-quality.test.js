#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { generateConclusionResult } = require("../flows/finish/conclusion-generator");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((error) => {
      console.error(`✗ ${name}`);
      throw error;
    });
}

test("does not fall back to heuristic summary when OpenAI summary is unavailable", async () => {
  const prevOpenAI = process.env.OPENAI_API_KEY;
  const prevAgent = process.env.OWA_AGENT_API_KEY;
  const prevCrs = process.env.CRS_OAI_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OWA_AGENT_API_KEY;
  delete process.env.CRS_OAI_KEY;

  try {
    const result = await generateConclusionResult([
      {
        parsed: {
          items: [{
            title: "苹果和飞书，快成新时代的Agent基建了。",
            author: "数字生命卡兹克",
            article_content: [
              "这个观点之所以这么说，其实是真的蛮有意思的。",
              "结果OpenClaw爆了之后，Mac成了Agent最适合运行的平台，因为Unix、统一内存架构和低功耗。",
              "而飞书恰好把文档、表格、日历、审批、知识库和多维表格都放在同一个云端体系里，并且全有API。",
            ].join(""),
            detail_url: "https://zhuanlan.zhihu.com/p/1",
            publish_time: 1772975580000,
          }],
        },
      },
    ], "去知乎看看数字生命卡兹克的最新文章", null, {
      taskAnalysis: {
        intent: "search",
        target_site: "zhihu.com",
        subtypes: ["entity_lookup", "latest_content_fetch", "content_understanding"],
        primary_subtype: "latest_content_fetch",
      },
    });

    assert.equal(result.conclusion, null);
    assert.equal(result.generator.status, "unavailable");
    assert.ok(!/local/i.test(result.generator.label));
  } finally {
    if (typeof prevOpenAI === "string") process.env.OPENAI_API_KEY = prevOpenAI;
    else delete process.env.OPENAI_API_KEY;
    if (typeof prevAgent === "string") process.env.OWA_AGENT_API_KEY = prevAgent;
    else delete process.env.OWA_AGENT_API_KEY;
    if (typeof prevCrs === "string") process.env.CRS_OAI_KEY = prevCrs;
    else delete process.env.CRS_OAI_KEY;
  }
});
