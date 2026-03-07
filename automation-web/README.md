# Automation Web

API-first 的 Web 自动化执行器：用自然语言描述任务，系统先生成执行计划，再通过 Playwright + 页面 JSON API 完成采集与汇总。

## 核心特性

- **单次规划，顺序执行**：先做一次任务分析与计划生成，再按计划逐步执行，不是每一步都重新调用 LLM
- **API-first**：优先监听和提取页面触发的 JSON API，尽量避免依赖脆弱的 DOM 解析
- **站点配置驱动**：通过 `flows/act/site-config.js` 配置搜索 URL、列表 API、详情 API、数据路径和少量站点提示
- **少量平台特化交互**：仅在必要时保留站点定制逻辑；当前 `click` 主要用于小红书搜索结果打开详情

## 快速开始

### 1. 启动浏览器

```bash
bash ../start-chrome.sh
```

### 2. 执行任务

```bash
node run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
```

## 执行流程

系统采用 **4 阶段执行模型**：

```
用户输入: "去小红书搜索 openclaw，返回前 3 篇文章"
  ↓
【阶段 1: 任务分析】
  - 识别意图: search（明确搜索）或 browse（漫无目的浏览）
  - 提取目标站点: xiaohongshu.com
  - 提取关键词: ["openclaw"]
  - 构建目标: "获取前 3 篇文章的标题和内容"
  - 生成完整 plan[]
  ↓
【阶段 2: 智能导航】
  - search 模式: 直接跳转到搜索结果页
    → https://www.xiaohongshu.com/search_result?keyword=openclaw&source=web_explore_feed
  - browse 模式: 跳转到站点首页
    → https://www.xiaohongshu.com/explore
  ↓
【阶段 3: 执行循环】
  每一步:
    1. 收集页面状态（URL / 标题 / API 响应）
    2. 从预生成 plan 中取下一个动作
    3. 执行操作: listen / goto / scrape_list / scrape_detail / click / back / wait / done
    4. 保存采集结果，记录历史
  循环直到任务完成或达到最大步数
  ↓
【阶段 4: 结果总结】
  - 汇总采集的数据（如果有 scrape 操作）
  - 生成结构化输出
  - 返回执行结果
```

## 站点配置

系统对常用站点进行了硬编码优化（`flows/act/site-config.js`），提供：

### 1. 搜索 URL 模板

支持直接构建搜索结果页 URL，跳过手动输入搜索框的步骤：

```javascript
"xiaohongshu.com": {
  urls: {
    search: "https://www.xiaohongshu.com/search_result?keyword={query}&source=web_explore_feed",
    browse: "https://www.xiaohongshu.com/explore"
  }
}
```

### 2. API 与规划能力

真正驱动采集的是站点 API 配置和规划提示，而不是通用 DOM Agent：

```javascript
"xiaohongshu.com": {
  planning: {
    preferred_flow: "list_then_detail",
    detail_open_mode: "click_result_item",
    content_from_list: false
  },
  api: {
    list: {
      endpoint: "https://edith.xiaohongshu.com/api/sns/web/v1/search/notes",
      items_path: "data.items"
    },
    detail: {
      endpoint: "https://edith.xiaohongshu.com/api/sns/web/v1/feed",
      detail_path: "data.items.0.note_card"
    }
  }
}
```

### 3. 选择器与平台特例

选择器主要用于少量站点提示或平台特化逻辑，不是通用候选元素系统：

```javascript
selectors: {
  article_link: ".note-item a.title",
  login_modal: ".login-modal",
  login_close_button: ".login-modal .close-btn"
}
```

### 4. 支持的站点

- 小红书 (xiaohongshu.com)
- 知乎 (zhihu.com)
- B站 (bilibili.com)
- 闲鱼 (goofish.com)
- 淘宝 (taobao.com)
- 京东 (jd.com)
- 微博 (weibo.com)
- 抖音 (douyin.com)

其中当前已配置 API-first 提取链路的主要是：

- **小红书**：列表 API + 详情 API，详情打开依赖站点特化 `click target_id`
- **知乎**：列表 API，可直接从搜索结果数据回答部分任务

其他站点目前主要提供 URL/selector 占位配置，尚未接入完整统一的列表/详情 API 提取链路。

## 输出协议

统一 JSON 格式：

```json
{
  "success": true,
  "message": "任务完成描述",
  "exit_code": 0,
  "timestamp": "2026-03-05T14:00:00.000Z",
  "meta": {
    "requires_human": false,
    "task": "原始任务描述",
    "extracted_count": 3,
    "extraction_file": "/path/to/extracted/data.txt",
    "url": "https://...",
    "conclusion": {
      "summary": "...",
      "links": [],
      "keyPoints": []
    },
    "steps": [
      {"step": 1, "action": "listen"},
      {"step": 2, "action": "goto", "url": "..."},
      {"step": 3, "action": "scrape_list", "max_items": 3},
      {"step": 4, "action": "done"}
    ]
  }
}
```

## 环境变量

```bash
# Agent 后端选择
OWA_AGENT_BACKEND=auto          # auto | claude | openai | api | codex

# Claude / OpenAI 规划模型
OWA_AGENT_MODEL=claude-sonnet-4-6

# Codex 规划模型（可选）
OWA_AGENT_CODEX_MODEL=o4-mini

# 最大执行步数
OWA_AGENT_MAX_STEPS=30          # 默认 30

# 任务超时
WEB_TASK_TIMEOUT_MS=180000

# Claude API 密钥
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI API 密钥
OPENAI_API_KEY=sk-...

# 浏览器 CDP 地址
WEB_CDP_URL=http://127.0.0.1:9222  # 默认 http://127.0.0.1:9222
```

## 示例

### 搜索任务

```bash
# 小红书搜索
node run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"

# 知乎搜索
node run-agent-task.js "在知乎搜索 AI Agent，找到最热门的 5 个回答"
```

### 浏览任务

```bash
# 浏览首页
node run-agent-task.js "打开小红书首页，看看有什么热门内容"

# 浏览特定页面
node run-agent-task.js "去知乎看看今天的热榜"
```

## 架构说明

详见 [CLAUDE.md](./CLAUDE.md) - 开发者指南

当前实现要点：

- `README` 反映的是当前主链路；旧设计文档若提到“每步重新决策”或通用坐标/selector 点击，应以 `flows/*` 实现为准
- 当前不存在通用 `state.candidates` 候选元素采集链路；列表链接和详情 URL 主要来自 API 响应数据
