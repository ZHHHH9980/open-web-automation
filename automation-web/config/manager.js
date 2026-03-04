/**
 * 站点配置管理器
 *
 * 使用方式：
 * const siteConfig = loadSiteConfig('闲鱼');
 * if (siteConfig) {
 *   // 使用配置执行搜索，不调用 LLM
 * }
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '../config/sites');

/**
 * 加载站点配置
 */
function loadSiteConfig(siteName) {
  const configFile = path.join(CONFIG_DIR, `${siteName.toLowerCase()}.json`);

  if (!fs.existsSync(configFile)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return config;
  } catch (err) {
    console.error(`[config] 加载配置失败: ${configFile}`, err);
    return null;
  }
}

/**
 * 列出所有已配置的站点
 */
function listSiteConfigs() {
  if (!fs.existsSync(CONFIG_DIR)) {
    return [];
  }

  return fs.readdirSync(CONFIG_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const config = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, f), 'utf8'));
      return {
        name: config.name,
        url: config.url,
        file: f
      };
    });
}

/**
 * 使用配置执行搜索（不调用 LLM）
 *
 * 支持的操作序列：
 * - goto → wait → type → press → wait → done
 * - goto → wait → click → type → press → wait → done (需要先点击搜索框)
 * - goto → wait → type → press → wait → press → wait → done (多次按键)
 */
async function executeSearch(page, config, query) {
  const steps = [];

  try {
    // 执行配置中定义的操作序列
    for (const step of config.search.steps) {
      switch (step.action) {
        case 'wait':
          await page.waitForTimeout(step.ms || 1200);
          steps.push({ action: 'wait', ms: step.ms || 1200 });
          break;

        case 'click':
          await page.locator(step.selector).first().click();
          steps.push({ action: 'click', selector: step.selector });
          break;

        case 'type':
          const input = await page.locator(step.selector).first();
          if (step.clear) {
            await input.fill('');  // 清空
          }
          await input.fill(query);
          steps.push({ action: 'type', selector: step.selector, text: query, clear: step.clear });
          break;

        case 'press':
          const target = step.selector
            ? await page.locator(step.selector).first()
            : page;
          await target.press(step.key);
          steps.push({ action: 'press', key: step.key, selector: step.selector });
          break;

        case 'wait_for_navigation':
          await page.waitForLoadState('networkidle', { timeout: step.timeout || 10000 });
          steps.push({ action: 'wait_for_navigation' });
          break;

        default:
          console.warn(`[config] 未知操作: ${step.action}`);
      }
    }

    return { ok: true, steps };
  } catch (err) {
    return { ok: false, error: err.message, steps };
  }
}

/**
 * 提取列表项（不调用 LLM）
 */
async function extractListItems(page, config) {
  if (!config.listItems) {
    return { ok: false, error: 'no_list_config' };
  }

  try {
    const items = await page.evaluate((pattern) => {
      // 将模式转换为实际选择器
      const actualPattern = pattern.replace(/:nth-of-type\(n\)/g, '');

      const elements = Array.from(document.querySelectorAll(actualPattern));

      return elements.map((el, idx) => ({
        index: idx,
        text: el.innerText?.substring(0, 200) || '',
        href: el.href || null,
        visible: el.offsetParent !== null
      }));
    }, config.listItems);

    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 筛选列表项（这里可以调用 LLM，但只传文本，不传截图）
 */
async function filterListItems(items, filters, preferences, llmClient) {
  // 构建轻量级 prompt（只传文本，不传截图）
  const prompt = `
你是一个列表筛选助手。根据用户的筛选条件和偏好，从列表中选择最合适的项。

筛选条件（必须满足）：
${filters.map(f => `- ${f}`).join('\n')}

偏好（优先考虑）：
${preferences.map(p => `- ${p}`).join('\n')}

列表项：
${items.map((item, idx) => `[${idx}] ${item.text}`).join('\n\n')}

请返回最合适的项的索引（0-${items.length - 1}）。只返回数字，不要解释。
`.trim();

  const response = await llmClient.complete(prompt);
  const index = parseInt(response.trim());

  if (isNaN(index) || index < 0 || index >= items.length) {
    return { ok: false, error: 'invalid_index' };
  }

  return { ok: true, index, item: items[index] };
}

module.exports = {
  loadSiteConfig,
  listSiteConfigs,
  executeSearch,
  extractListItems,
  filterListItems
};
