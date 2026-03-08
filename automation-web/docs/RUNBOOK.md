# Runbook

## Role

这份 Runbook 说明如何把 `automation-web` 作为本地执行器跑起来，并验证它能被上层系统稳定调用。

## Boundary

这份文档不负责：

- Telegram Bot 配置
- `openclaw-automation-bridge` 的部署细节
- OpenClaw Gateway / Node 的完整接入手册

它只关心一件事：当前机器上的执行器是否可用。

## Interface

### Runtime Prerequisites

在开始前，确认当前机器具备：

- Node.js 可用
- `automation-web` 依赖已安装
- 本机 Chrome 可被 CDP 连接
- `automation-web/config/browser.json` 已初始化，或环境变量已提供可用 CDP 地址

### Primary Command

最常用的验证命令：

```bash
cd automation-web
node launcher.js "去知乎看看热榜"
```

如果你是从 OpenClaw 或其他上层系统接入，也可以验证 adapter 入口：

```bash
cd automation-web
node adapters/openclaw/cli.js '{"task_id":"task_smoke","prompt":"去知乎看看热榜"}'
```

### Expected Outputs

运行后重点看三类输出：

- `stdout`：最后一行 JSON
- `stderr`：`[agent]` 进度日志与保存结果提示
- `outputs/*.md`：长结果文件

## Runbook

### 1. Install

```bash
cd automation-web
npm install
```

### 2. Initialize Browser Config

首次在一台新机器运行时，建议先执行：

```bash
cd automation-web
node config/init-browser.js
```

这一步会帮助你生成 `config/browser.json`。

### 3. Start Or Verify Chrome / CDP

如果本机没有可用 CDP，可以手动启动：

```bash
cd ..
./start-chrome.sh
```

如果不手动启动，执行器也会在连接失败时尝试自动拉起 Chrome；可通过 `WEB_CDP_AUTO_LAUNCH=0` 关闭该行为。

### 4. Run A Smoke Test

```bash
cd automation-web
node launcher.js "去知乎看看热榜"
```

通过标准：

- 能看到单行 JSON 输出
- `success = true`，或至少输出了结构化失败结果
- 遇到登录阻塞时，返回 `meta.requires_human = true`

### 5. Validate Result Files

如果任务有采集结果，确认：

- `outputs/*.md` 已生成
- `meta.extraction_file` 指向原始提取文件
- `meta.conclusion` 存在可读总结

如果任务被登录拦住，确认：

- `has_screenshot = true`
- `meta.screenshot_path` 指向本地截图
- `exit_code = 2`

### 6. Integrate With A Bridge Or Worker

如果上层是一个 Node worker，推荐按下面方式接：

- `cwd` 指向 `automation-web`
- 调用命令：`node launcher.js "<prompt>"`
- 只消费 `stdout` 最后一行 JSON
- 额外读取 `outputs/*.md` 与 `meta.screenshot_path` 作为 artifact

如果上层需要 OpenClaw 形状的结果，可改用：

- `node adapters/openclaw/cli.js '{"task_id":"task_123","prompt":"..."}'`

### 7. Troubleshooting Order

排障建议按这个顺序进行：

1. 先确认 `node launcher.js "..."` 能在本机单独跑通
2. 再确认本机浏览器 / CDP 可用
3. 再看 `stderr` 中的 `[agent]` 进度日志
4. 再看返回 JSON 中的 `message`、`exit_code`、`meta`
5. 最后再检查上层 bridge / worker 的映射逻辑

### Common Failure Patterns

#### Browser Not Reachable

表现：启动后很快失败，或报 CDP 连接问题。

优先检查：

- Chrome 是否已启动
- `WEB_CDP_URL` 是否正确
- `config/browser.json` 是否与当前机器匹配

#### Human Blocked By Login / Captcha

表现：`success = false` 且 `meta.requires_human = true`。

处理方式：

- 打开截图查看阻塞原因
- 在保留的浏览器页面完成登录或验证码
- 用同一个任务重新执行一次

#### Planner Or Execution Timeout

表现：`exit_code = 124`。

优先检查：

- `WEB_TASK_TIMEOUT_MS` 是否过小
- 页面加载是否异常缓慢
- 任务描述是否过长或过于模糊

#### Structured Failure But No Output File

表现：返回失败 JSON，但没有 `outputs/*.md`。

这是正常的。只有在存在提取结果或总结内容时，执行器才会生成可阅读的结果文件。

