#!/usr/bin/env node
/**
 * 快速搜索脚本 - 使用配置执行，不调用 LLM
 *
 * 使用方式：
 * node run-fast-search.js 闲鱼 "iPhone 13 Pro"
 *
 * 优势：
 * - 成本：0 次 LLM，0 次截图
 * - 速度：~3 秒（vs 完全动态的 ~30 秒）
 */

const { chromium } = require('playwright');
const { loadSiteConfig, executeSearch } = require('./config/manager');

async function main() {
  const siteName = process.argv[2];
  const query = process.argv[3];

  if (!siteName || !query) {
    console.error('用法: node run-fast-search.js <站点名称> <搜索词>');
    console.error('示例: node run-fast-search.js 闲鱼 "iPhone 13 Pro"');
    console.error('\n可用站点:');
    const { listSiteConfigs } = require('./config/manager');
    const sites = listSiteConfigs();
    sites.forEach(s => console.error(`  - ${s.name} (${s.url})`));
    process.exit(1);
  }

  // 1. 加载配置
  const config = loadSiteConfig(siteName);

  if (!config) {
    console.error(`未找到站点配置: ${siteName}`);
    console.error('\n请先运行以下命令生成配置:');
    console.error(`  node tools/extract-patterns.js ${siteName}`);
    console.error('或:');
    console.error('  node tools/site-wizard.js');
    process.exit(1);
  }

  console.log(`站点: ${config.name}`);
  console.log(`URL: ${config.url}`);
  console.log(`搜索词: ${query}`);
  console.log(`置信度: ${(config.stats.confidence * 100).toFixed(1)}%\n`);

  // 2. 打开浏览器
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const startTime = Date.now();

  try {
    // 3. 导航到站点
    console.log('导航到站点...');
    await page.goto(config.url);
    await page.waitForLoadState('networkidle');

    // 4. 执行搜索（使用配置，不调用 LLM）
    console.log('执行搜索...');
    const result = await executeSearch(page, config, query);

    const duration = Date.now() - startTime;

    if (result.ok) {
      console.log(`\n✓ 搜索成功！`);
      console.log(`  耗时: ${(duration / 1000).toFixed(1)}s`);
      console.log(`  步骤数: ${result.steps.length}`);
      console.log(`  当前 URL: ${page.url()}`);
      console.log('\n成本分析:');
      console.log('  LLM 调用: 0 次');
      console.log('  截图: 0 次');
      console.log('  成本: $0.00');
      console.log('\n对比完全动态模式:');
      console.log('  成本降低: 100%');
      console.log('  速度提升: ~10x');

      // 等待用户查看结果
      console.log('\n浏览器保持打开，按 Ctrl+C 关闭');
      await new Promise(() => {}); // 永久等待
    } else {
      console.error(`\n✗ 搜索失败: ${result.error}`);
      console.error('\n建议:');
      console.error('1. 检查配置是否正确');
      console.error('2. 运行 node tools/test-config.js ' + siteName + ' "' + query + '"');
      console.error('3. 或回退到完全动态模式: node run-agent-task.js "打开' + siteName + '，搜索' + query + '"');
      await browser.close();
      process.exit(1);
    }
  } catch (err) {
    console.error('\n✗ 执行出错:', err.message);
    await browser.close();
    process.exit(1);
  }
}

main().catch(console.error);
