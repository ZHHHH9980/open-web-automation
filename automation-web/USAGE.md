# USAGE.md

## 最常用命令

### 执行任务

```bash
node launcher.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
```

### 初始化浏览器配置

```bash
node config/init-browser.js
```

### 手动启动 Chrome

```bash
cd ..
./start-chrome.sh
```

## 推荐使用方式

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化本地浏览器配置（可选）

```bash
node config/init-browser.js
```

### 3. 直接执行任务

```bash
node launcher.js "在知乎搜索 AI Agent，整理前 5 条结果"
```

## 常见环境变量

```bash
OWA_AGENT_BACKEND=auto
OWA_AGENT_CODEX_MODEL=o4-mini
OWA_AGENT_MAX_STEPS=30
WEB_TASK_TIMEOUT_MS=180000
WEB_CDP_URL=http://127.0.0.1:9222
WEB_CDP_AUTO_LAUNCH=1
OWA_AGENT_PROGRESS=1
OWA_AGENT_DEBUG=0
```

## 输出说明

程序会：

- 在 stdout 输出一行 JSON 结果
- 在 stderr 输出执行进度日志（默认开启）
- 在有采集内容时生成 `outputs/YYYY-MM-DD_HH-mm-ss_platform.md`

## 调试建议

- 看 `meta.steps` 了解实际动作序列
- 开 `OWA_AGENT_DEBUG=1` 看更详细日志
- 需要保留浏览器时设置 `WEB_KEEP_OPEN=1`
- 遇到登录拦截时检查 `meta.requires_human`

## 说明

这份文档只保留日常使用方式。

实现说明看：

- `README.md`
- `ARCHITECTURE.md`
- `CLAUDE.md`
