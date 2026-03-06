#!/usr/bin/env node
"use strict";

/**
 * 测试 collectPageState 实际收集到的 API 状态
 */

const { chromium } = require("playwright");
const { collectPageState, startApiCollection } = require("./core/state-collector");

async function testCollectState(url) {
  console.log(`\n🔗 连接到浏览器...`);

  const cdpUrl = process.env.CDP_URL || "http://localhost:9222";
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  const context = contexts[0];
  const page = await context.newPage();

  // 在导航前启动 API 监听
  console.log(`\n📡 启动 API 监听...`);
  const apiCollector = startApiCollection(page);

  console.log(`\n🌐 导航到: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  console.log(`✅ 页面加载完成`);

  console.log(`\n📊 调用 collectPageState...`);
  const state = await collectPageState(page, 1, 30, apiCollector);

  console.log(`\n--- 收集到的状态 ---`);
  console.log(`URL: ${state.url}`);
  console.log(`标题: ${state.title}`);
  // 检查 API 响应
  console.log(`\n--- API 响应 ---`);
  if (state.api_responses && state.api_responses.length > 0) {
    console.log(`捕获到 ${state.api_responses.length} 个 API 响应:`);
    state.api_responses.forEach((api, i) => {
      console.log(`\n${i + 1}. ${api.method} ${api.url}`);
      console.log(`   状态: ${api.status}`);
      console.log(`   数据大小: ${api.dataSize} 字节`);

      // 检查是否是搜索结果接口
      if (api.url.includes("/search/notes")) {
        console.log(`   ⭐ 这是搜索结果接口！`);
        const data = api.data?.data;
        if (data?.items) {
          console.log(`   包含 ${data.items.length} 个结果项`);
          console.log(`   has_more: ${data.has_more}`);
          // 显示前 3 个结果
          data.items.slice(0, 3).forEach((item, idx) => {
            const note = item.note_card;
            if (note) {
              console.log(`     ${idx + 1}. ${note.display_title || note.title || "无标题"}`);
              console.log(`        作者: ${note.user?.nickname || "未知"}`);
              console.log(`        点赞: ${note.interact_info?.liked_count || 0}`);
            }
          });
        }
      }
    });
  } else {
    console.log(`未捕获到 API 响应`);
  }

  console.log(`\n✨ 测试完成！`);
}

(async () => {
  const url =
    process.argv[2] ||
    "https://www.xiaohongshu.com/search_result?keyword=openclaw&source=web_explore_feed&type=51";

  try {
    await testCollectState(url);
  } catch (error) {
    console.error(`\n❌ 错误:`, error.message);
    process.exit(1);
  }
})();
