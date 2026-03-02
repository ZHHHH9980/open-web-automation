# Open Web Automation

面向真实账号场景的自然语言网页自动化 Agent（独立仓库，不依赖 AutoGLM）。

## 主要需求（项目目标）

- 自然语言一键执行，不要求用户手写结构化参数。
- 支持多站点自动化：知乎 / 小红书 / Google。
- 复用本机已登录 Chrome 账号（CDP 接管），避免重复登录。
- 默认保留页面给人类接管，遇到验证码/风控时不死磕。
- 控制标签页增长，避免无限开 tab。
- 单任务控制在约 3 分钟内，失败时给可读错误与截图。
- 后续可接入 Telegram Bot/OpenClaw，作为远程指令入口。

## 架构设计

```
自然语言指令
   ↓
run-unified-task.js (统一入口)
   ↓
automation-web/executor.js
   ├─ 意图解析（站点/动作/参数）
   ├─ CDP 连接已登录 Chrome
   ├─ 任务执行（Google/知乎/小红书）
   ├─ 风控/登录检测（触发人类接管）
   └─ Tab 管理（复用+清理）
   ↓
统一 JSON 结果（success/message/screenshot/meta）
```

## 当前支持能力

- 知乎：
  - 查看关注博主
  - 按关键词搜索博主/内容
  - 查询“某博主最新回答”
- 小红书：
  - 搜索笔记
  - 填写发布页（默认安全模式，不自动点最终发布）
- Google：
  - 常规搜索并提取前几条结果

## 快速开始

1) 安装依赖

```bash
cd automation-web
npm install
```

2) 启动可复用登录态的 Chrome

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-agent-profile" \
  --profile-directory="Default"
```

3) 执行自然语言任务

```bash
node run-unified-task.js "在知乎查看关注的博主"
node run-unified-task.js "帮我看看知乎 DeepVan 这个博主的最新回答"
node run-unified-task.js "小红书搜索 露营攻略"
node run-unified-task.js "Google 搜索 Playwright connectOverCDP"
```

## 人机协同策略

- 检测到登录/验证码/风控时：返回 `requires_human=true`，并保留页面。
- 用户手动处理后：可直接继续下发下一条自然语言指令。
- 小红书发布默认安全：需 `WEB_PUBLISH_CONFIRM=1` 才会自动点击发布。

## 常用环境变量

- `WEB_CDP_URL`：默认 `http://127.0.0.1:9222`
- `WEB_KEEP_OPEN`：默认保留页面；设为 `0` 时自动关闭
- `WEB_MAX_DOMAIN_TABS`：同域标签页上限，默认 `2`
- `WEB_PUBLISH_CONFIRM=1`：允许小红书自动点击发布

## 代码结构

- `run-unified-task.js`：统一入口（自然语言任务）
- `automation-web/executor.js`：核心执行器（解析、调度、风控、tab 管理）
- `automation-web/run-web-task.js`：Web 执行器直连入口
- `automation-web/test-parser.js`：意图解析用例测试
