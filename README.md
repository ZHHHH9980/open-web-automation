# Open Web Automation

AI Agent 驱动的智能网页自动化工具 - 用自然语言控制浏览器，自动搜索、抓取、总结网页内容。

## 核心流程

```
人类指令 → Agent 分析 → 执行搜索 → 抓取内容 → Agent 总结
```

**示例**：
```bash
# 输入指令
node automation-web/run-agent-task.js "去小红书搜索 AI Agent，返回前 3 篇文章"

# Agent 自动完成
1. 分析任务：识别目标站点（小红书）、提取关键词（AI Agent）
2. 执行搜索：打开小红书 → 搜索 "AI Agent" → 定位文章列表
3. 抓取内容：点击文章 → 提取标题和正文 → 返回列表（重复 3 次）
4. 生成总结：汇总文章信息，输出结构化结果
```

## 核心能力

- **自然语言驱动**：用一句话描述任务，Agent 自动分析和执行
- **智能搜索**：自动识别目标站点，构建搜索策略
- **内容抓取**：支持文章、评论、商品等多种内容类型
- **智能总结**：Agent 自动提炼关键信息，生成结构化输出
- **真实账号场景**：支持登录态、验证码、人机验证

## 快速开始

### 1. 启动浏览器

```bash
# 启动 Chrome（开启 CDP 端口 9222）
./start-chrome.sh
```

### 2. 执行任务

```bash
# 搜索任务
node automation-web/run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章"

# 知乎搜索
node automation-web/run-agent-task.js "在知乎搜索 AI Agent，找到最热门的 5 个回答"

# B站搜索
node automation-web/run-agent-task.js "去B站搜索编程教程，返回播放量最高的 3 个视频"
```

## 工作原理

### 1. 指令分析

Agent 接收自然语言指令，自动分析：
- **目标站点**：识别小红书、知乎、B站等常用站点
- **搜索关键词**：提取核心搜索词
- **任务目标**：理解需要抓取的内容类型和数量

### 2. 执行搜索

Agent 自动执行搜索操作：
- 打开目标站点
- 输入搜索关键词
- 定位搜索结果列表
- 识别目标内容（文章、视频、商品等）

### 3. 抓取内容

Agent 智能抓取页面内容：
- **视觉识别**：基于截图识别页面元素
- **DOM 操作**：使用选择器精确定位
- **平台适配**：自动适配不同网站的交互模式
  - Modal 模式（小红书）：点击打开弹窗 → 提取内容 → 关闭弹窗
  - Page 模式（知乎）：点击跳转页面 → 提取内容 → 返回列表

### 4. 生成总结

Agent 自动总结抓取的内容：
- 提炼关键信息
- 生成结构化输出
- 包含标题、链接、摘要等

## 输出格式

```json
{
  "success": true,
  "message": "任务完成",
  "exit_code": 0,
  "meta": {
    "task": "去小红书搜索 AI Agent，返回前 3 篇文章",
    "url": "https://www.xiaohongshu.com/search?q=AI+Agent",
    "steps": [
      {"step": 1, "action": "goto", "url": "https://www.xiaohongshu.com"},
      {"step": 2, "action": "type", "text": "AI Agent"},
      {"step": 3, "action": "click", "target": "第一篇文章"},
      {"step": 4, "action": "extract", "label": "文章内容"}
    ],
    "extracted_count": 3,
    "conclusion": {
      "summary": "找到 3 篇关于 AI Agent 的文章...",
      "links": [
        "https://www.xiaohongshu.com/article/1",
        "https://www.xiaohongshu.com/article/2",
        "https://www.xiaohongshu.com/article/3"
      ]
    }
  }
}
```

## 支持的站点

系统内置常用站点配置，开箱即用：

- 小红书 (xiaohongshu.com)
- 知乎 (zhihu.com)
- B站 (bilibili.com)
- 闲鱼 (goofish.com)
- 淘宝 (taobao.com)
- 京东 (jd.com)
- 微博 (weibo.com)
- 抖音 (douyin.com)

未配置的站点会自动通过 Google 搜索定位。

## 环境变量

```bash
# Agent 配置
OWA_AGENT_MAX_STEPS=15          # 最大执行步数（默认 15）
OWA_AGENT_MODEL=claude-sonnet-4-6  # 使用的 LLM 模型
ANTHROPIC_API_KEY=sk-ant-...    # Claude API 密钥

# 浏览器配置
WEB_CDP_URL=http://127.0.0.1:9222  # Chrome CDP 地址
WEB_KEEP_OPEN=1                 # 任务完成后保持浏览器打开
WEB_TASK_TIMEOUT_MS=180000      # 任务超时时间（3分钟）
```

## 适用场景

✅ **适合**：
- 需要搜索和抓取网页内容
- 需要 Agent 自动分析和总结信息
- 需要登录态的真实账号操作
- 复杂的多步骤网页任务
- 动态页面、SPA 应用

❌ **不适合**：
- 简单的 API 调用
- 需要毫秒级响应的场景
- 大规模批量爬取（成本较高）

## 技术架构

- **LLM Agent**：Claude Sonnet 4.6 驱动的智能决策
- **浏览器控制**：Playwright + Chrome CDP
- **视觉识别**：基于截图的元素定位
- **平台适配**：自动识别网站交互模式

详细架构说明见 [automation-web/ARCHITECTURE.md](automation-web/ARCHITECTURE.md)
