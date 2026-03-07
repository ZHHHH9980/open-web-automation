# OpenClaw 接入清单

这份清单用于把 `automation-web` 接到 OpenClaw Node 中使用。

## 这个仓库能直接提供什么

- 接收自然语言网页任务
- 连接本地 Chrome / CDP 执行任务
- 在 `stdout` 输出一行 JSON 结果
- 在有采集内容时生成 `outputs/*.md`
- 在需要人工介入时返回截图和状态信号

## 接入方式

推荐由 OpenClaw Node 在本机直接调用 CLI，或者直接调用仓库内的 OpenClaw adapter：

```bash
cd automation-web
node launcher.js "去知乎搜索 AI Agent，返回前 5 条结果"
node adapters/openclaw/cli.js '{"task_id":"task_123","prompt":"去知乎搜索 AI Agent，返回前 5 条结果"}'
```

你真正需要消费的只有三类输出：

- `stdout`：最终 JSON
- `stderr`：执行日志
- `outputs/*.md`：完整结果文件

## 接入 Checklist

- [ ] OpenClaw Node 与浏览器部署在同一台机器
- [ ] 本机 Chrome 已可通过 CDP 连接
- [ ] `automation-web/config/browser.json` 已初始化
- [ ] OpenClaw Node 能执行 `node launcher.js "..."`
- [ ] OpenClaw Node 能读取 `stdout` 最后一行 JSON
- [ ] OpenClaw Node 能读取本地文件 `outputs/*.md`
- [ ] OpenClaw Node 能读取本地截图 `meta.screenshot_path`
- [ ] 上层结果展示已区分成功 / 失败 / 人工介入三种状态

## 任务输入

OpenClaw 侧通常准备这些字段即可：

```json
{
  "task_id": "task_123",
  "prompt": "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容",
  "timeout_ms": 180000,
  "debug_mode": false
}
```

真正传给本仓库的最小输入只有 `prompt`。

## 结果怎么读

优先关注这些字段：

- `success`
- `message`
- `exit_code`
- `has_screenshot`
- `screenshot`
- `meta.requires_human`
- `meta.screenshot_path`
- `meta.extraction_file`
- `meta.conclusion`
- `meta.url`

建议映射方式：

- `success = true` -> 任务完成
- `success = false && meta.requires_human = true` -> 等待人工介入
- 其他情况 -> 任务失败

## 登录阻塞怎么处理

当任务被登录弹窗、扫码或验证码挡住时，会返回类似结果：

```json
{
  "success": false,
  "message": "login modal detected: 请先登录",
  "has_screenshot": true,
  "screenshot": "<base64>",
  "exit_code": 2,
  "meta": {
    "requires_human": true,
    "screenshot_path": "/path/to/outputs/screenshots/123-human-block.jpg",
    "retry_hint": "请完成登录后重新执行同一个任务"
  }
}
```

接入时通常这样处理：

- [ ] 把 `meta.requires_human = true` 映射成等待人工处理状态
- [ ] 优先读取 `meta.screenshot_path` 发送本地截图
- [ ] 如果链路更适合传内容，再使用 `screenshot` 的 base64
- [ ] 人工完成登录后，重试同一个任务

## 结果回传建议

如果上层是聊天系统，推荐这样用：

- 短结果：发送 `meta.conclusion.summary`
- 长结果：发送 `outputs/*.md`
- 登录阻塞：发送截图 + 提示语
- 调试场景：保留 `meta.steps`

## Adapter 位置

- `adapters/openclaw/index.js`：JS API
- `adapters/openclaw/cli.js`：CLI 入口

## 最小调用示例

直接调用 adapter JS API：

```js
const { runOpenClawTask } = require("./adapters/openclaw");

const result = await runOpenClawTask({
  task_id: "task_123",
  prompt: "去知乎搜索 AI Agent，返回前 5 条结果",
});
```

如果上层仍然更习惯 shell，也可以继续调用 CLI：

```js
const { execFile } = require("child_process");

function runWebAutomation(prompt) {
  return new Promise((resolve, reject) => {
    execFile(
      "node",
      ["launcher.js", prompt],
      { cwd: "/path/to/open-web-automation/automation-web", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (stderr) console.error(stderr);

        const lines = String(stdout || "").trim().split("\n").filter(Boolean);
        const lastLine = lines[lines.length - 1];
        if (!lastLine) return reject(new Error("launcher produced no JSON output"));

        try {
          resolve(JSON.parse(lastLine));
        } catch (err) {
          reject(new Error(`invalid JSON output: ${err.message}`));
        }
      }
    );
  });
}
```

## 建议开工顺序

- [ ] 先在 OpenClaw Node 所在机器手动跑通 `node launcher.js "..."`
- [ ] 再把这条命令包成一个 Node capability / handler
- [ ] 先只接成功结果和失败结果
- [ ] 最后再补 `requires_human`、截图和重试逻辑

## 相关文件

- `launcher.js`
- `flows/orchestrator.js`
- `flows/act/run-loop.js`
- `flows/finish/finalize-task.js`
- `USAGE.md`
