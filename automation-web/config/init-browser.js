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
    console.log('1. 启动浏览器: ./start-chrome.sh');
    console.log('2. 执行任务: node run-agent-task.js "打开闲鱼，搜索 iPhone"');
  } else {
    console.error('\n配置失败');
    process.exit(1);
  }
})();
