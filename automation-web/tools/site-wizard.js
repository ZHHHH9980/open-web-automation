#!/usr/bin/env node
/**
 * 站点配置向导 - 让用户快速配置检索流程
 *
 * 使用方式：
 * node tools/site-wizard.js
 *
 * 流程：
 * 1. 用户输入站点名称和 URL
 * 2. 打开浏览器，用户点击关键元素
 * 3. 系统记录 DOM 选择器
 * 4. 生成配置文件
 */

const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  console.log('=== 站点配置向导 ===\n');

  // 1. 收集基本信息
  const siteName = await question('站点名称（如：闲鱼）: ');
  const siteUrl = await question('站点 URL（如：https://www.goofish.com）: ');
  const searchQuery = await question('测试搜索词（如：iPhone 13）: ');

  console.log('\n正在打开浏览器...\n');

  // 2. 打开浏览器
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(siteUrl);
  await page.waitForLoadState('networkidle');

  console.log('浏览器已打开，请按照提示操作：\n');

  // 3. 引导用户点击搜索框
  console.log('步骤 1: 请点击搜索框');
  const searchInput = await waitForUserClick(page);
  console.log(`✓ 已记录搜索框: ${searchInput.selector}\n`);

  // 4. 自动输入测试搜索词
  await page.fill(searchInput.selector, searchQuery);
  console.log(`已输入测试搜索词: ${searchQuery}`);

  // 5. 引导用户点击搜索按钮（或按 Enter）
  const useEnter = await question('\n是否按 Enter 键搜索？(y/n): ');
  let searchButton = null;

  if (useEnter.toLowerCase() === 'y') {
    await page.press(searchInput.selector, 'Enter');
    console.log('✓ 已按 Enter 键');
  } else {
    console.log('\n步骤 2: 请点击搜索按钮');
    searchButton = await waitForUserClick(page);
    console.log(`✓ 已记录搜索按钮: ${searchButton.selector}`);
  }

  // 6. 等待结果加载
  await page.waitForLoadState('networkidle');
  console.log('\n搜索结果已加载');

  // 7. 引导用户点击列表项（可选）
  const hasListItems = await question('\n是否需要配置列表项选择？(y/n): ');
  let listItemPattern = null;

  if (hasListItems.toLowerCase() === 'y') {
    console.log('\n步骤 3: 请点击一个列表项');
    const listItem = await waitForUserClick(page);
    listItemPattern = inferListPattern(listItem.selector);
    console.log(`✓ 已推断列表项模式: ${listItemPattern}`);
  }

  // 8. 生成配置（操作序列）
  const searchSteps = [];

  // 初始等待
  searchSteps.push({ action: 'wait', ms: 1200 });

  // 是否需要先点击搜索框
  const needClickFirst = await question('\n是否需要先点击搜索框才能输入？(y/n): ');
  if (needClickFirst.toLowerCase() === 'y') {
    searchSteps.push({ action: 'click', selector: searchInput.selector });
  }

  // 输入搜索词
  searchSteps.push({
    action: 'type',
    selector: searchInput.selector,
    clear: true
  });

  // 触发搜索
  if (useEnter.toLowerCase() === 'y') {
    searchSteps.push({ action: 'press', key: 'Enter', selector: searchInput.selector });
  } else {
    searchSteps.push({ action: 'click', selector: searchButton.selector });
  }

  // 等待加载
  searchSteps.push({ action: 'wait', ms: 1200 });

  // 是否需要额外的按键操作
  const needMoreKeys = await question('\n是否需要额外的按键操作？(y/n): ');
  if (needMoreKeys.toLowerCase() === 'y') {
    const extraKey = await question('请输入按键（如 Enter, Tab, Escape）: ');
    searchSteps.push({ action: 'press', key: extraKey });
    searchSteps.push({ action: 'wait', ms: 1200 });
  }

  // 等待导航完成
  searchSteps.push({ action: 'wait_for_navigation', timeout: 10000 });

  const config = {
    name: siteName,
    url: siteUrl,
    search: {
      steps: searchSteps
    },
    listItems: listItemPattern,
    createdAt: new Date().toISOString()
  };

  // 9. 保存配置
  const configDir = path.join(__dirname, '../config/sites');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configFile = path.join(configDir, `${siteName.toLowerCase()}.json`);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

  console.log(`\n✓ 配置已保存到: ${configFile}`);
  console.log('\n配置内容:');
  console.log(JSON.stringify(config, null, 2));

  await browser.close();
  rl.close();
}

/**
 * 等待用户点击元素
 */
async function waitForUserClick(page) {
  return new Promise(async (resolve) => {
    // 注入点击监听器
    await page.evaluate(() => {
      window.__clickedElement = null;
      document.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__clickedElement = e.target;
      }, { capture: true, once: true });
    });

    // 轮询检查是否点击
    const checkInterval = setInterval(async () => {
      const clicked = await page.evaluate(() => {
        if (window.__clickedElement) {
          const el = window.__clickedElement;

          // 生成 CSS 选择器
          const selector = generateSelector(el);

          // 获取元素信息
          return {
            selector,
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            placeholder: el.placeholder || null,
            text: el.innerText?.substring(0, 50) || null
          };
        }
        return null;

        function generateSelector(element) {
          if (element.id) return `#${element.id}`;

          const path = [];
          while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase();

            if (element.className) {
              const classes = element.className.split(' ').filter(c => c && !c.match(/^[0-9]/));
              if (classes.length > 0) {
                selector += '.' + classes.join('.');
              }
            }

            path.unshift(selector);
            element = element.parentNode;

            if (path.length > 3) break; // 限制深度
          }

          return path.join(' > ');
        }
      });

      if (clicked) {
        clearInterval(checkInterval);
        resolve(clicked);
      }
    }, 100);
  });
}

/**
 * 从单个选择器推断列表项模式
 */
function inferListPattern(selector) {
  // 移除具体的索引，保留结构
  return selector
    .replace(/:nth-of-type\(\d+\)/g, ':nth-of-type(n)')
    .replace(/:nth-child\(\d+\)/g, ':nth-child(n)');
}

main().catch(console.error);
