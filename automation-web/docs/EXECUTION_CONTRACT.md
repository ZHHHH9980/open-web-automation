# Execution Contract

## Role

`automation-web` 是一个本地网页任务执行器。

它负责：

- 接收自然语言网页任务
- 连接本机 Chrome / CDP
- 规划并执行页面动作
- 输出统一 JSON 结果
- 在有内容产出时生成 `outputs/*.md`
- 在需要人工介入时返回截图和状态信号

## Boundary

`automation-web` 不负责：

- Telegram 消息接入与回复
- OpenClaw Gateway / Node 的路由与会话管理
- 上层任务编排、权限控制、用户管理
- 长期记忆、项目记录、知识库管理
- 远程部署编排与多机调度

如果上层需要聊天入口、任务分发、结果转发，应由 `openclaw-automation-bridge` 或其他上层系统实现。

## Interface

### Entry Points

当前推荐的执行入口有三种：

1. 直接调用 CLI

```bash
cd automation-web
node launcher.js "去知乎搜索 AI Agent，整理前 5 条结果"
```

2. 调用 OpenClaw adapter CLI

```bash
cd automation-web
node adapters/openclaw/cli.js '{"task_id":"task_123","prompt":"去知乎搜索 AI Agent，整理前 5 条结果"}'
```

3. 作为 Node 模块调用

```js
const { runOpenClawTask } = require("./adapters/openclaw");

const result = await runOpenClawTask({
  task_id: "task_123",
  prompt: "去知乎搜索 AI Agent，整理前 5 条结果",
});
```

### Minimal Input

最小输入只有一个自然语言任务：

```json
{
  "prompt": "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
}
```

如果通过 `launcher.js` 调用，等价输入就是一个字符串 prompt。

### Optional Input Fields

如果通过 adapter 或上层系统调用，常用可选字段包括：

- `task_id`
- `prompt`
- `timeout_ms`
- `max_steps`
- `debug_mode`
- `cdp_url`
- `keep_open`
- `keep_open_on_human`

这些字段会被映射到运行时选项，用于控制超时、执行步数、CDP 地址和浏览器保留策略。

### Raw Result Shape

`launcher.js` 的标准输出是单行 JSON，基础结构如下：

```json
{
  "success": true,
  "message": "task completed",
  "has_screenshot": false,
  "screenshot": "",
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

### Required Top-Level Fields

每次执行都会返回这些顶层字段：

- `success`
- `message`
- `has_screenshot`
- `screenshot`
- `exit_code`
- `timestamp`
- `meta`

### Common `meta` Fields

最常见的 `meta` 字段包括：

- `requires_human`：是否需要人工介入
- `task`：原始任务文本
- `steps`：执行历史步骤
- `url`：结束时页面 URL
- `extracted_count`：提取条数
- `extraction_file`：原始提取文件路径
- `conclusion`：生成的总结结果

条件性字段包括：

- `screenshot_path`：人工阻塞时的截图文件路径
- `retry_hint`：人工处理后的重试提示
- `human_block`：阻塞详情
- `error`：异常场景附带的错误信息
- `planned_action` / `not_executable_reason`：计划动作不可执行时的说明
- `dom_data`：开启 DOM 提取时附加的数据

并不是每次执行都会包含全部 `meta` 字段；上层必须按“字段可缺省”方式消费结果。

### Status Semantics

推荐上层按下面规则理解结果：

- `success = true` -> 任务完成
- `success = false && meta.requires_human = true` -> 等待人工介入
- 其他失败情况 -> 任务失败

### Exit Code Semantics

当前实现里，常见 `exit_code` 语义如下：

- `0`：任务成功完成
- `2`：人工介入阻塞
- `1`：通用执行失败
- `4`：规划或动作校验类失败
- `124`：超时或达到最大步数

### Artifacts

执行器可能产出两类本地文件：

- `outputs/YYYY-MM-DD_HH-mm-ss_platform.md`：便于阅读的结果摘要与采集内容
- `outputs/screenshots/*.jpg`：人工阻塞时的截图文件

上层如果需要完整长文结果，优先读取 `outputs/*.md`；如果需要提示人工登录，优先读取 `meta.screenshot_path`。

## Runbook

日常启动、联调与排错步骤见 `automation-web/docs/RUNBOOK.md`。

