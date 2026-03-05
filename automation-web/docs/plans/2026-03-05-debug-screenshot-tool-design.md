# Debug Screenshot Tool Design

## 问题描述

在使用 visual model 进行 Web 自动化时，发现一个问题：
- 在首页/列表页，输入框和按钮的点击识别正常
- 进入任务详情页面后，Agent 完全找不到任何可点击的元素（candidates 列表为空）

需要创建一个独立的 debug 项目来调查这个问题，重点关注截图是否正常。

## 设计目标

1. 创建独立的 debug 项目（在仓库外）
2. 保存每一步的截图到项目内的目录（而不是 `/tmp`）
3. 输出截图路径，方便手动检查页面内容
4. 记录基本的调试信息（candidates 数量、URL 等）
5. 复用原项目代码，避免重复开发

## 项目结构

```
/Users/a1/Documents/automation-web-debug/
├── package.json
├── debug-task.js          # 入口文件
├── screenshots/           # 截图保存目录
│   └── [task-id]/        # 每次任务一个子目录
│       ├── step-1.png
│       ├── step-2.png
│       └── ...
├── logs/                  # 日志目录
│   └── [task-id].json    # 每次任务的元数据
└── viewer.html           # 简单的 HTML 查看器（可选）
```

## 核心功能

### 1. 截图管理

- 每次任务生成唯一 ID：`task_[timestamp]_[random]`
- 截图保存路径：`screenshots/[task-id]/step-N.png`
- 每一步执行后立即保存截图
- 终端输出截图路径

### 2. 日志记录

保存到 `logs/[task-id].json`，包含：

```json
{
  "task_id": "task_1234567890_abc",
  "task": "用户输入的任务描述",
  "started_at": "2026-03-05T08:00:00Z",
  "steps": [
    {
      "step": 1,
      "url": "https://example.com",
      "action": "goto",
      "candidates_count": 15,
      "screenshot": "screenshots/task_xxx/step-1.png",
      "timestamp": "2026-03-05T08:00:01Z"
    },
    {
      "step": 2,
      "url": "https://example.com/detail",
      "action": "click",
      "candidates_count": 0,
      "screenshot": "screenshots/task_xxx/step-2.png",
      "timestamp": "2026-03-05T08:00:03Z"
    }
  ]
}
```

### 3. 代码复用策略

- 通过相对路径 `require()` 原项目的模块
- 不复制代码，避免维护两份
- 包装 `runAgentTask`，在每一步后拦截并保存截图
- 不修改原项目代码

## 使用方式

### 安装

```bash
cd /Users/a1/Documents
mkdir automation-web-debug
cd automation-web-debug
npm init -y
npm install playwright
```

### 运行

```bash
node debug-task.js "你的任务描述"
```

### 输出示例

```
[debug] Task ID: task_1709625600_abc123
[debug] Screenshots will be saved to: screenshots/task_1709625600_abc123/
[step 1/15] goto https://example.com
  └─ screenshot: screenshots/task_1709625600_abc123/step-1.png
  └─ candidates: 15 elements found
[step 2/15] click "登录"
  └─ screenshot: screenshots/task_1709625600_abc123/step-2.png
  └─ candidates: 8 elements found
[step 3/15] goto https://example.com/detail
  └─ screenshot: screenshots/task_1709625600_abc123/step-3.png
  └─ candidates: 0 elements found ⚠️
...
[debug] Task completed
[debug] Log saved to: logs/task_1709625600_abc123.json
```

## 与原项目的差异

| 特性 | 原项目 | Debug 项目 |
|------|--------|-----------|
| 截图保存位置 | `/tmp` | `./screenshots/[task-id]/` |
| 截图输出 | 不输出路径 | 每一步输出路径 |
| Candidates 信息 | 不输出数量 | 输出数量，0 时高亮警告 |
| 日志记录 | 无 | 保存完整的执行日志 |
| 代码位置 | 仓库内 | 仓库外独立项目 |

## 实现要点

### 1. 截图拦截

在 `debug-task.js` 中包装原项目的 `collectPageState` 函数：

```javascript
const originalCollectPageState = require('../automation-web/core/state-collector').collectPageState;

async function debugCollectPageState(page, step, candidateLimit, taskId) {
  const state = await originalCollectPageState(page, step, candidateLimit);

  // 保存截图到项目目录
  const screenshotDir = path.join(__dirname, 'screenshots', taskId);
  fs.mkdirSync(screenshotDir, { recursive: true });

  const screenshotPath = path.join(screenshotDir, `step-${step}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(state.screenshot_b64, 'base64'));

  // 输出调试信息
  console.log(`[step ${step}] screenshot: ${screenshotPath}`);
  console.log(`  └─ candidates: ${state.candidates.length} elements found`);

  return state;
}
```

### 2. 日志记录

在每一步执行后，追加日志到 JSON 文件：

```javascript
function appendLog(taskId, stepData) {
  const logPath = path.join(__dirname, 'logs', `${taskId}.json`);
  let log = { task_id: taskId, steps: [] };

  if (fs.existsSync(logPath)) {
    log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  }

  log.steps.push(stepData);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}
```

## 预期效果

通过这个 debug 工具，可以：

1. **快速定位问题**：通过截图直接看到页面是否正常渲染
2. **对比差异**：对比首页和详情页的截图，找出差异
3. **验证假设**：如果截图正常但 candidates 为空，说明是元素识别逻辑的问题
4. **保留证据**：所有截图和日志都保存下来，方便后续分析

## 后续扩展（可选）

如果需要更深入的调试，可以添加：

1. **HTML 查看器**：生成一个简单的 HTML 页面，展示所有截图和日志
2. **DOM 快照**：保存每一步的完整 DOM 结构
3. **元素过滤分析**：记录 `isVisible` 等过滤条件的详细结果
4. **对比报告**：自动对比首页和详情页的差异

但目前的设计已经足够解决"截图是否正常"这个核心问题。
