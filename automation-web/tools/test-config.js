#!/usr/bin/env node
/**
 * 测试站点配置
 *
 * 使用方式：
 * node tools/test-config.js 闲鱼 "iPhone 13 Pro"
 */

const { chromium } = require('playwright');
const { loadSiteConfig, executeSearch } = require('../config/manager');

async function main() {
  const siteName = process.argv[2];
  const query = process.argv[3];

  if (!siteName || !query) {
    console.error('用法: node tools/test-config.js <站点名称> <搜索词>');
    console.error('示例: node tools/test-config.js 闲鱼 "iPhone 13 Pro"');
    process.exit(1);
  }

  console.log(`测试站点: ${siteName}`);
  console.log(`搜索词: ${query}\n`);

  // 1. 加载配置
  const config = loadSiteConfig(siteName);

  if (!config) {
    console.error(`未找到站点配置: ${siteName}`);
    console.error('请先运行: node tools/extract-patterns.js ' + siteName);
    process.exit(1);
  }

  console.log('✓ 配置已加载');
  console.log(`  URL: ${config.url}`);
  console.log(`  步骤数: ${config.search.steps.length}`);
  console.log(`  置信度: ${(config.stats.confidence * 100).toFixed(1)}%\n`);

  // 2. 打开浏览器
  console.log('正在打开浏览器...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 3. 导航到站点
    console.log(`导航到: ${config.url}`);
    await page.goto(config.url);
    await page.waitForLoadState('networkidle');

    // 4. 执行搜索（使用配置，不调用 LLM）
    console.log('\n开始执行搜索（使用配置）...');
    const startTime = Date.now();

    const result = await executeSearch(page, config, query);

    const duration = Date.now() - startTime;

    if (result.ok) {
      console.log(`\n✓ 搜索成功！耗时: ${duration}ms`);
      console.log(`  执行步骤: ${result.steps.length}`);
      console.log(`  当前 URL: ${page.url()}`);
      console.log('\n执行的步骤:');
      result.steps.forEach((step, idx) => {
        console.log(`  ${idx + 1}. ${step.action}${step.key ? ` (${step.key})` : ''}`);
      });

      console.log('\n成本分析:');
      console.log('  LLM 调用: 0 次');
      console.log('  截图: 0 次');
      console.log('  成本: $0.00');

      // 等待用户查看结果
      console.log('\n按 Ctrl+C 关闭浏览器');
      await new Promise(() => {}); // 永久等待
    } else {
      console.error(`\n✗ 搜索失败: ${result.error}`);
      console.error('执行的步骤:');
      result.steps.forEach((step, idx) => {
        console.error(`  ${idx + 1}. ${step.action}`);
      });
      process.exit(1);
    }
  } catch (err) {
    console.error('\n✗ 执行出错:', err.message);
    process.exit(1);
  } finally {
    // 不自动关闭，让用户查看结果
  }
}

main().catch(console.error);
