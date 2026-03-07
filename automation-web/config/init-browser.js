#!/usr/bin/env node
/**
 * 浏览器配置初始化工具
 *
 * 使用方式：
 * node config/init-browser.js
 */

const { initBrowserConfig } = require('./browser-config');

(async () => {
  const config = await initBrowserConfig();

  if (config) {
    console.log('\n下一步:');
    console.log('1. 直接执行任务（未启动时会自动拉起 Chrome）');
    console.log('2. 如需手动启动: ./start-chrome.sh');
    console.log('3. 执行任务: node launcher.js "打开闲鱼，搜索 iPhone"');
  } else {
    console.error('\n配置失败');
    process.exit(1);
  }
})();
