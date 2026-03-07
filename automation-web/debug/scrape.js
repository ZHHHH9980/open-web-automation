#!/usr/bin/env node
"use strict";

/**
 * Playwright 抓取能力测试脚本
 *
 * 使用方法：
 * 1. 先启动带调试端口的浏览器：
 *    macOS: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug-profile"
 *    或使用现有 profile: --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
 *
 * 2. 运行测试：
 *    node debug/scrape.js "https://www.zhihu.com/search?q=AI"
 *    node debug/scrape.js "https://www.bilibili.com/search?keyword=编程"
 */

const { chromium } = require("playwright");

async function testScrape(url) {
  console.log(`\n🔗 连接到浏览器...`);

  // 连接到已运行的浏览器
  const cdpUrl = process.env.CDP_URL || "http://localhost:9222";
  const browser = await chromium.connectOverCDP(cdpUrl);

  console.log(`✅ 已连接到: ${cdpUrl}`);

  const contexts = browser.contexts();
  const context = contexts[0];

  console.log(`📄 当前打开的标签页数: ${context.pages().length}`);

  // 创建新标签页或使用现有标签页
  const page = await context.newPage();

  // 监听网络请求
  const apiRequests = [];
  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    // 只记录 JSON 响应
    if (contentType.includes("application/json")) {
      try {
        const json = await response.json();
        apiRequests.push({
          url,
          status: response.status(),
          method: response.request().method(),
          dataSize: JSON.stringify(json).length,
          preview: JSON.stringify(json).slice(0, 200),
        });
      } catch (e) {
        // 忽略解析失败的响应
      }
    }
  });

  console.log(`\n🌐 导航到: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  console.log(`✅ 页面加载完成`);
  console.log(`📍 当前 URL: ${page.url()}`);
  console.log(`📝 页面标题: ${await page.title()}`);

  // 等待页面稳定
  await page.waitForTimeout(2000);

  console.log(`\n🔍 开始抓取页面内容...`);

  // 方法 1: 获取所有链接
  console.log(`\n--- 方法 1: 获取所有链接 ---`);
  const links = await page.$$eval("a", (anchors) =>
    anchors
      .map((a) => ({
        text: a.innerText?.trim() || "",
        href: a.href || "",
      }))
      .filter((link) => link.text && link.href)
      .slice(0, 10)
  );
  console.log(`找到 ${links.length} 个链接（前 10 个）:`);
  links.forEach((link, i) => {
    console.log(`  ${i + 1}. ${link.text.slice(0, 50)} -> ${link.href}`);
  });

  // 方法 2: 尝试识别列表项
  console.log(`\n--- 方法 2: 识别列表项 ---`);
  const listItems = await page.evaluate(() => {
    const selectors = [
      "article",
      "[class*='item']",
      "[class*='card']",
      "[class*='result']",
      "[class*='list'] > *",
      "li",
    ];

    const results = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const items = Array.from(elements)
          .slice(0, 5)
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            text: el.innerText?.trim().slice(0, 100) || "",
          }))
          .filter((item) => item.text);

        if (items.length > 0) {
          results.push({ selector, count: elements.length, items });
          break;
        }
      }
    }
    return results;
  });

  if (listItems.length > 0) {
    listItems.forEach((result) => {
      console.log(`\n选择器: ${result.selector}`);
      console.log(`总数: ${result.count}`);
      console.log(`前 5 个项目:`);
      result.items.forEach((item, i) => {
        console.log(`  ${i + 1}. [${item.tag}.${item.class}]`);
        console.log(`     ${item.text}`);
      });
    });
  } else {
    console.log(`未找到明显的列表结构`);
  }

  // 方法 3: 获取页面文本内容
  console.log(`\n--- 方法 3: 页面文本内容（前 500 字符）---`);
  const bodyText = await page.locator("body").innerText();
  console.log(bodyText.slice(0, 500));

  // 方法 4: 获取页面结构信息
  console.log(`\n--- 方法 4: 页面结构信息 ---`);
  const structure = await page.evaluate(() => {
    return {
      articles: document.querySelectorAll("article").length,
      sections: document.querySelectorAll("section").length,
      divs: document.querySelectorAll("div").length,
      lists: document.querySelectorAll("ul, ol").length,
      listItems: document.querySelectorAll("li").length,
      links: document.querySelectorAll("a").length,
      images: document.querySelectorAll("img").length,
    };
  });
  console.log(JSON.stringify(structure, null, 2));

  // 方法 5: 显示捕获的 API 请求
  console.log(`\n--- 方法 5: API 请求（JSON 响应）---`);
  if (apiRequests.length > 0) {
    console.log(`捕获到 ${apiRequests.length} 个 JSON 响应:`);
    apiRequests.forEach((req, i) => {
      console.log(`\n  ${i + 1}. ${req.method} ${req.url}`);
      console.log(`     状态: ${req.status}`);
      console.log(`     数据大小: ${req.dataSize} 字节`);
      console.log(`     预览: ${req.preview}...`);
    });
  } else {
    console.log(`未捕获到 JSON API 请求`);
  }

  // 截图
  console.log(`\n📸 保存截图...`);
  const screenshotPath = `/tmp/playwright-test-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`✅ 截图已保存: ${screenshotPath}`);

  console.log(`\n✨ 测试完成！`);
  console.log(`\n💡 提示: 标签页保持打开状态，可以手动查看或继续测试`);
  console.log(`   关闭浏览器后脚本会自动退出`);

  // 不关闭浏览器，保持连接
  // await browser.close();
}

// 主函数
(async () => {
  const url = process.argv[2];

  if (!url) {
    console.error(`\n❌ 请提供要测试的 URL`);
    console.error(`\n用法: node debug/scrape.js <URL>`);
    console.error(`\n示例:`);
    console.error(`  node debug/scrape.js "https://www.zhihu.com/search?q=AI"`);
    console.error(`  node debug/scrape.js "https://www.bilibili.com/search?keyword=编程"`);
    console.error(`\n提示: 先启动浏览器:`);
    console.error(
      `  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/Google/Chrome"`
    );
    process.exit(1);
  }

  try {
    await testScrape(url);
  } catch (error) {
    console.error(`\n❌ 错误:`, error.message);
    console.error(`\n💡 确保浏览器已启动并监听 9222 端口:`);
    console.error(
      `   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/Google/Chrome"`
    );
    process.exit(1);
  }
})();
