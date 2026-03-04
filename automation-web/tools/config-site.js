#!/usr/bin/env node
/**
 * 统一的站点配置工具
 *
 * 使用方式：
 * node tools/config-site.js "打开闲鱼，搜索 iPhone"
 *
 * 系统会自动：
 * 1. 从任务中提取站点名
 * 2. 检查 patterns.jsonl 是否有足够的成功记录
 * 3. 如果有 → 自动提取配置
 * 4. 如果没有 → 启动交互式配置向导
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

async function main() {
  const task = process.argv.slice(2).join(' ');

  if (!task) {
    console.error('用法: node tools/config-site.js "任务描述"');
    console.error('示例: node tools/config-site.js "打开闲鱼，搜索 iPhone"');
    process.exit(1);
  }

  console.log(`任务: ${task}\n`);

  // 1. 提取站点名
  const siteName = extractSiteName(task);

  if (!siteName) {
    console.error('无法从任务中提取站点名');
    console.error('请确保任务中包含站点名称，如："打开闲鱼"、"搜索知乎"');
    process.exit(1);
  }

  console.log(`检测到站点: ${siteName}\n`);

  // 2. 检查是否已有配置
  const existingConfig = loadSiteConfig(siteName);
  if (existingConfig) {
    console.log(`✓ 站点已配置`);
    console.log(`  URL: ${existingConfig.url}`);
    console.log(`  置信度: ${(existingConfig.stats.confidence * 100).toFixed(1)}%`);
    console.log('\n配置文件:', path.join(__dirname, `../config/sites/${siteName.toLowerCase()}.json`));
    return;
  }

  // 3. 检查 patterns.jsonl 中的成功记录
  const successCount = await countSuccessPatterns(siteName);
  console.log(`在历史记录中找到 ${successCount} 条成功记录\n`);

  if (successCount >= 3) {
    // 方式 1：自动提取
    console.log('✓ 成功记录足够，自动提取配置...\n');
    await extractFromPatterns(siteName);
  } else {
    // 方式 2：交互式配置
    console.log('成功记录不足，启动交互式配置向导...\n');
    await interactiveConfig(siteName, task);
  }
}

/**
 * 从任务中提取站点名
 */
function extractSiteName(task) {
  const patterns = [
    /打开(.+?)[，,、]/,
    /搜索(.+?)[，,、]/,
    /在(.+?)[上中]/,
    /(.+?)上/,
    /(.+?)搜索/
  ];

  for (const pattern of patterns) {
    const match = task.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * 加载站点配置
 */
function loadSiteConfig(siteName) {
  const configFile = path.join(__dirname, `../config/sites/${siteName.toLowerCase()}.json`);
  if (!fs.existsSync(configFile)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 统计成功记录数
 */
async function countSuccessPatterns(siteName) {
  const patternsFile = path.join(__dirname, '../learning/data/patterns.jsonl');
  if (!fs.existsSync(patternsFile)) {
    return 0;
  }

  let count = 0;
  const fileStream = fs.createReadStream(patternsFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const pattern = JSON.parse(line);
        if (pattern.success &&
            pattern.inferredSatisfaction &&
            pattern.task.includes(siteName)) {
          count++;
        }
      } catch {
        // 跳过无效行
      }
    }
  }

  return count;
}

/**
 * 从 patterns.jsonl 自动提取配置
 */
async function extractFromPatterns(siteName) {
  // 调用 extract-patterns.js 的逻辑
  const { execSync } = require('child_process');
  try {
    execSync(`node "${path.join(__dirname, 'extract-patterns.js')}" "${siteName}"`, {
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('提取配置失败:', err.message);
    process.exit(1);
  }
}

/**
 * 交互式配置向导
 */
async function interactiveConfig(siteName, task) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
  }

  // 从任务中提取搜索词
  const searchQuery = extractSearchQuery(task) || 'iPhone 13';

  const siteUrl = await question(`站点 URL（如 https://www.goofish.com）: `);

  console.log('\n正在打开浏览器...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(siteUrl);
  await page.waitForLoadState('networkidle');

  console.log('浏览器已打开，请按照提示操作：\n');
  console.log('步骤 1: 请点击搜索框');

  const searchInput = await waitForUserClick(page);
  console.log(`✓ 已记录搜索框: ${searchInput.selector}\n`);

  await page.fill(searchInput.selector, searchQuery);
  console.log(`已输入测试搜索词: ${searchQuery}`);

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

  await page.waitForLoadState('networkidle');

  // 生成配置
  const searchSteps = [
    { action: 'wait', ms: 1200 },
    { action: 'type', selector: searchInput.selector, clear: true },
    { action: 'press', key: 'Enter', selector: searchInput.selector },
    { action: 'wait', ms: 1200 },
    { action: 'wait_for_navigation', timeout: 10000 }
  ];

  const config = {
    name: siteName,
    url: siteUrl,
    search: { steps: searchSteps },
    listItems: null,
    createdAt: new Date().toISOString(),
    stats: { extractedFrom: 0, confidence: 1.0 }
  };

  const configDir = path.join(__dirname, '../config/sites');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configFile = path.join(configDir, `${siteName.toLowerCase()}.json`);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

  console.log(`\n✓ 配置已保存到: ${configFile}`);

  await browser.close();
  rl.close();
}

/**
 * 提取搜索词
 */
function extractSearchQuery(task) {
  const match = task.match(/搜索\s*(.+?)(?:[，,。]|$)/);
  return match ? match[1].trim() : null;
}

/**
 * 等待用户点击元素
 */
async function waitForUserClick(page) {
  return new Promise(async (resolve) => {
    await page.evaluate(() => {
      window.__clickedElement = null;
      document.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__clickedElement = e.target;
      }, { capture: true, once: true });
    });

    const checkInterval = setInterval(async () => {
      const clicked = await page.evaluate(() => {
        if (window.__clickedElement) {
          const el = window.__clickedElement;
          const selector = generateSelector(el);
          return {
            selector,
            tag: el.tagName.toLowerCase(),
            type: el.type || null
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
            if (path.length > 3) break;
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

main().catch(console.error);
