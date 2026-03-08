# Automation Web

一个以 **Plan -> Execute -> Finalize** 为主链路的 Web 自动化执行器。

系统会先根据自然语言任务生成 `analysis + plan`，再通过 Playwright 连接浏览器，按计划执行动作，并优先从页面触发的 JSON API 中提取数据。

## 当前实现特点

- **先规划，再执行**：不是每一步都重新调用模型做自由决策
- **API-first**：优先监听接口并提取结构化数据
- **站点配置驱动**：站点差异主要放在 `flows/act/site-config.js`
- **平台特化尽量少**：只在必要场景保留少量站点定制逻辑

## 主链路

```text
launcher.js
  -> flows/orchestrator.js
  -> flows/init/task-initializer.js
  -> flows/plan/task-planner.js
  -> planners/*
  -> flows/act/run-loop.js
  -> flows/act/executor.js
  -> flows/finish/finalize-task.js
```

更细的说明见：

- `ARCHITECTURE.md`
- `CLAUDE.md`
- `docs/EXECUTION_CONTRACT.md`
- `docs/RUNBOOK.md`
- `docs/openclaw-integration.md`

## 安装

```bash
cd automation-web
npm install
```

## 快速开始

### 1. 直接执行任务

```bash
node launcher.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
```

### 2. 可选：初始化本地浏览器配置

```bash
node config/init-browser.js
```

这个向导会把本地 Chrome profile / CDP 配置写入 `config/browser.json`。

### 3. 可选：手动启动浏览器

```bash
cd ..
./start-chrome.sh
```

如果没有手动启动，程序也会在连接本地 CDP 失败时尝试自动拉起 Chrome；可通过 `WEB_CDP_AUTO_LAUNCH=0` 关闭。

## 执行流程

一次任务的主流程如下：

1. planner 生成 `analysis + plan`
2. 根据 `target_site`、`intent`、`keywords` 解析初始 URL
3. 连接浏览器并打开页面
4. 按顺序执行 `listen / goto / scrape_* / click / back / wait / done`
5. 汇总采集结果，输出统一 JSON

## 当前站点支持

已配置站点域名：

- `xiaohongshu.com`
- `zhihu.com`
- `bilibili.com`
- `goofish.com`
- `taobao.com`
- `jd.com`
- `weibo.com`
- `douyin.com`

当前能力更完整的主要是：

- `xiaohongshu.com`：支持搜索 URL、列表 API、详情 API
- `zhihu.com`：支持搜索 URL、搜索结果列表 API、首页浏览 feed API

其他站点目前主要提供 URL 级别的起始导航和基础 planning 信息，还没有完整的 list/detail API 提取链路。

## 输出结果

CLI 会输出一行 JSON，核心字段如下：

```json
{
  "success": true,
  "message": "task completed",
  "exit_code": 0,
  "timestamp": "2026-03-07T00:00:00.000Z",
  "meta": {
    "requires_human": false,
    "task": "原始任务",
    "steps": [],
    "extracted_count": 0,
    "extraction_file": null,
    "conclusion": null,
    "url": "https://..."
  }
}
```

如果有采集结果，程序还会额外把总结和便于阅读的结构化结果写到 `outputs/YYYY-MM-DD_HH-mm-ss_platform.md`。

如果你要把这个仓库作为一个可交接的“执行器”来使用，建议按下面顺序阅读：

- `docs/EXECUTION_CONTRACT.md`：Role / Boundary / Interface 的唯一真相
- `docs/RUNBOOK.md`：启动、验证、联调、排障步骤
- `docs/openclaw-integration.md`：OpenClaw / Node 接入清单

## OpenClaw 接入

如果你希望把本仓库接到 OpenClaw Node 中使用，推荐直接由 Node 在本机调用 `launcher.js`，再消费返回的 JSON 结果。

接入时通常会用到这些能力：

- 用自然语言 prompt 触发任务执行
- 从 `stdout` 读取统一 JSON
- 在 `meta.requires_human = true` 时处理人工登录
- 读取 `meta.screenshot_path` 或 `screenshot` 返回登录截图
- 在有采集结果时读取 `outputs/*.md` 作为完整结果文件

完整说明见 `docs/openclaw-integration.md`。如果你想直接走适配层入口，可以使用 `adapters/openclaw/index.js` 或 `npm run run:openclaw`。

## 常用环境变量

```bash
# planner 后端: auto | claude | openai | api | codex
OWA_AGENT_BACKEND=auto

# OpenAI planner 模型（默认 `gpt-5.4`）
OWA_AGENT_MODEL=gpt-5.4

# Codex planner 模型
OWA_AGENT_CODEX_MODEL=o4-mini

# planner 超时（毫秒）
OWA_AGENT_PLAN_TIMEOUT_MS=60000

# 最大执行步数
OWA_AGENT_MAX_STEPS=30

# 整体任务超时（毫秒）
WEB_TASK_TIMEOUT_MS=180000

# 是否打印进度日志
OWA_AGENT_PROGRESS=1

# 是否打印更详细的调试输出
OWA_AGENT_DEBUG=0

# CDP 地址
WEB_CDP_URL=http://127.0.0.1:9222

# 连不上本地 CDP 时是否自动拉起 Chrome
WEB_CDP_AUTO_LAUNCH=1

# 任务结束后保留浏览器
WEB_KEEP_OPEN=0

# 需要人工介入时保留浏览器
WEB_KEEP_OPEN_ON_HUMAN=1

# 结果中附带 DOM 提取数据
OWA_EXTRACT_DOM=0

# Claude / OpenAI API Key
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
OWA_AGENT_API_KEY=...
```

## 示例

### 搜索任务

```bash
node launcher.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
node launcher.js "在知乎搜索 AI Agent，整理前 5 条结果"
```

### 浏览任务

```bash
node launcher.js "打开小红书首页，看看最近热门内容"
node launcher.js "去知乎看看热榜"
```

## 调试

常见调试手段：

- 看 stderr 中的 `[agent]` 进度日志
- 查看返回 JSON 里的 `meta.steps`
- 查看 `outputs/YYYY-MM-DD_HH-mm-ss_platform.md`
- 临时加上 `--debug-mode=true`
- 用 `npm run debug:collect-state -- "https://www.zhihu.com/"` 检查实际捕获到的接口
- 用 `npm run debug:scrape -- "https://www.zhihu.com/"` 快速查看页面 DOM / 链接 / JSON 响应

## 注意

如果旧文档里出现下面这些说法，应以当前实现为准：

- 每一步都重新调用模型决策
- 视觉截图 / 坐标点击是主路径
- 配置模式 / 动态模式是当前主架构
- 存在独立 learning system 主导执行
