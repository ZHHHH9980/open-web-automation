# 站点配置系统

## 快速开始

### 方式 1：从历史记录自动提取（推荐，最快）

如果你已经成功执行过某个站点的任务，可以直接从历史记录提取配置：

```bash
node tools/extract-patterns.js 闲鱼
```

系统会：
1. 分析 `patterns.jsonl` 中所有成功的闲鱼任务
2. 提取最常见的操作序列（如 `goto → wait → type → press → wait → done`）
3. 提取搜索框选择器
4. 自动生成配置文件

**优势**：
- 零手动操作
- 基于真实成功案例
- 自动计算置信度

### 方式 2：交互式配置向导（5 分钟）

如果是新站点，或者想手动配置：

```bash
node tools/site-wizard.js
```

按照提示操作：
1. 输入站点名称（如：闲鱼）
2. 输入站点 URL（如：https://www.goofish.com）
3. 输入测试搜索词（如：iPhone 13）
4. 浏览器打开后，点击搜索框
5. 选择是否按 Enter 或点击搜索按钮
6. 选择是否需要额外的按键操作
7. （可选）点击一个列表项，系统会推断列表模式

配置自动保存到 `config/sites/闲鱼.json`

### 2. 使用配置执行搜索（不调用 LLM）

```javascript
const { loadSiteConfig, executeSearch } = require('./config/manager');

// 加载配置
const config = loadSiteConfig('闲鱼');

if (config) {
  // 使用配置执行搜索（不调用 LLM，不截图）
  const result = await executeSearch(page, config, 'iPhone 13 Pro');

  if (result.ok) {
    console.log('搜索成功，步骤:', result.steps);
    // 成本：0 次 LLM 调用，0 次截图
  }
} else {
  // 回退到完全动态模式
  const result = await runAgentTask(page, task);
  // 成本：15 次 LLM 调用，15 次截图
}
```

### 3. 列表筛选（只调用 1 次 LLM，不传截图）

```javascript
const { extractListItems, filterListItems } = require('./config/manager');

// 提取列表项（不调用 LLM）
const { items } = await extractListItems(page, config);

// 筛选列表项（只调用 1 次 LLM，只传文本）
const { index, item } = await filterListItems(
  items,
  ['256GB', '国行', '不要包装盒'],  // hard_filters
  ['最便宜'],                        // preferences
  llmClient
);

// 点击选中的项
await page.locator(config.listItems).nth(index).click();
```

## 成本对比

### 完全动态模式（现状）

```
任务：搜索闲鱼 iPhone 13 Pro

步骤 1: goto → LLM + 截图
步骤 2: wait → LLM + 截图
步骤 3: type → LLM + 截图
步骤 4: press → LLM + 截图
步骤 5: wait → LLM + 截图
步骤 6: done → LLM + 截图

总成本：6 次 LLM 调用 + 6 次截图
```

### 配置模式（优化后）

```
任务：搜索闲鱼 iPhone 13 Pro

步骤 1: 加载配置（本地文件）
步骤 2: 定位搜索框（DOM）
步骤 3: 输入搜索词（DOM）
步骤 4: 按 Enter（DOM）
步骤 5: 等待加载（DOM）

总成本：0 次 LLM 调用 + 0 次截图
```

### 混合模式（推荐）

```
任务：搜索闲鱼最便宜的 iPhone 13 Pro 256GB 国行

步骤 1-5: 使用配置执行搜索（0 次 LLM）
步骤 6: 提取列表项（DOM）
步骤 7: LLM 筛选（1 次 LLM，只传文本）
步骤 8: 点击目标项（DOM）

总成本：1 次 LLM 调用 + 0 次截图
成本降低：83%（6 次 → 1 次）
```

## 配置文件格式

### 完整示例（支持复杂操作序列）

```json
{
  "name": "闲鱼",
  "url": "https://www.goofish.com",
  "search": {
    "steps": [
      { "action": "wait", "ms": 1200 },
      { "action": "click", "selector": "#header > header > div > form > input" },
      { "action": "type", "selector": "#header > header > div > form > input", "clear": true },
      { "action": "press", "key": "Enter", "selector": "#header > header > div > form > input" },
      { "action": "wait", "ms": 1200 },
      { "action": "press", "key": "Enter" },
      { "action": "wait", "ms": 1200 },
      { "action": "wait_for_navigation", "timeout": 10000 }
    ]
  },
  "listItems": "div.item > a:nth-of-type(n)",
  "createdAt": "2026-03-04T12:00:00.000Z",
  "stats": {
    "extractedFrom": 15,
    "confidence": 0.87
  }
}
```

### 支持的操作

| 操作 | 参数 | 说明 |
|------|------|------|
| `wait` | `ms` | 等待指定毫秒 |
| `click` | `selector` | 点击元素 |
| `type` | `selector`, `clear` | 输入文本（clear=true 会先清空） |
| `press` | `key`, `selector?` | 按键（可选指定元素） |
| `wait_for_navigation` | `timeout` | 等待页面导航完成 |

### 操作序列模式

从 patterns.jsonl 分析出的常见模式：

```
模式 1（最常见）：
goto → wait → type → press → wait → done
出现频率：60%

模式 2（需要先点击）：
goto → wait → click → type → press → wait → done
出现频率：25%

模式 3（多次按键）：
goto → wait → type → press → wait → press → wait → done
出现频率：10%

模式 4（滚动后操作）：
goto → scroll → type → press → wait → done
出现频率：5%
```

## 集成到 llm-agent.js

```javascript
// 在 runAgentTask() 开头添加
const { loadSiteConfig, executeSearch } = require('./config/manager');

// 尝试使用配置
const siteName = extractSiteName(task);  // 从任务中提取站点名
const config = loadSiteConfig(siteName);

if (config && isSearchTask(task)) {
  // 使用配置执行搜索（快速路径）
  const query = extractSearchQuery(task);
  const result = await executeSearch(page, config, query);

  if (result.ok) {
    console.log('[config] 使用配置执行搜索，成本：0 次 LLM');
    // 继续后续流程（如列表筛选）
  } else {
    console.log('[config] 配置执行失败，回退到动态模式');
    // 回退到完全动态模式
  }
} else {
  // 完全动态模式
  // ... 现有代码
}
```

## 优势

1. **快速配置**：5 分钟配置一个站点
2. **成本降低**：搜索流程成本降低 100%（6 次 → 0 次）
3. **不依赖截图**：只在筛选时调用 LLM，且只传文本
4. **渐进式**：配置失败自动回退到动态模式
5. **可维护**：配置文件是 JSON，易于理解和修改

## 下一步

1. 运行 `node tools/site-wizard.js` 配置闲鱼
2. 测试搜索流程
3. 对比成本和成功率
4. 逐步配置其他高频站点
