# Open Web Automation

一个用于**执行自然语言网页任务**的本地浏览器自动化仓库。

它适合这样的场景：你给一句任务，例如“去知乎搜索 AI Agent，整理前 5 条结果”，程序会连接本地浏览器，执行搜索、浏览、抓取和整理，并返回统一 JSON 结果；如果过程中遇到登录拦截，也会返回截图和人工介入信号。

## 这个仓库是做什么的

你可以把它理解成一个“网页任务执行器”：

- 接收自然语言任务
- 连接本地 Chrome / CDP
- 执行搜索、浏览、抓取、整理
- 输出统一 JSON 结果
- 在有采集内容时生成 `outputs/*.md`
- 在需要人工介入时返回截图

它本身更像一个本地 worker，适合被命令行、Node 服务、OpenClaw Node 或其他上层系统调用。

## 最常见的用法

### 1. 安装依赖

```bash
cd automation-web
npm install
```

### 2. 初始化浏览器配置

```bash
node config/init-browser.js
```

### 3. 执行任务

```bash
node launcher.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
node launcher.js "在知乎搜索 AI Agent，整理前 5 条结果"
```

如果本地 CDP 没有启动，程序默认会尝试自动拉起 Chrome；也可以手动运行：

```bash
./start-chrome.sh
```

## 执行后会得到什么

程序会输出三类结果：

- `stdout`：一行 JSON，适合程序解析
- `stderr`：执行日志，适合排查问题
- `automation-web/outputs/*.md`：可直接阅读或回传的结果文件

常见结果包括：

- 正常完成：返回摘要、步骤、采集结果等
- 需要登录：返回 `meta.requires_human = true` 和截图
- 执行失败：返回失败原因和退出码

## 适合接到哪里

这个仓库适合接到：

- 本地命令行工具
- Node.js 服务
- 聊天机器人后端
- OpenClaw Node

如果你要把它接到 OpenClaw，接入说明见：

- `automation-web/docs/openclaw-integration.md:1`

## 仓库里主要看哪里

- `automation-web/README.md:1`：执行器说明
- `automation-web/USAGE.md:1`：最常用命令
- `automation-web/docs/openclaw-integration.md:1`：OpenClaw 接入清单
- `automation-web/ARCHITECTURE.md:1`：更细的实现结构

## 当前能力概览

当前已内置一些常见站点配置，包括：

- 小红书
- 知乎
- B站
- 闲鱼
- 淘宝
- 京东
- 微博
- 抖音

其中当前能力相对更完整的是小红书和知乎。

## 一句话总结

如果你需要一个**能在本地浏览器里执行网页任务、返回结构化结果、并支持人工接管登录**的执行器，这个仓库就是干这个的。
