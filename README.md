# Open Web Automation

面向真实账号场景的网页自动化项目（Chrome CDP + Playwright）。

> 独立仓库，不与 AutoGLM 代码混放：`ZHHHH9980/open-web-automation`

## 架构总览

```text
Human / TG Bot
   -> Planner (NL -> JSON 指令)
   -> run-unified-task.js (统一入口)
   -> automation-web/engine.js (路由 + 超时 + 结果收敛)
   -> automation-web/workflows/* (站点工作流)
   -> Unified JSON Result

E2E: automation-web/harness/run-e2e.js
   -> 30+ 真实 case 批测
   -> 人机验证自动 skip（不中断整批）
```

## 目录结构

```text
.
├── run-unified-task.js              # 仓库统一入口
├── automation-web/
│   ├── engine.js                    # 执行引擎（路由/超时/关闭策略）
│   ├── core/
│   │   ├── input.js                 # 输入协议（仅 JSON）
│   │   ├── browser.js               # CDP 连接、tab 复用、截图
│   │   └── result.js                # 统一输出协议 + 人机验证识别
│   ├── workflows/
│   │   ├── google.js
│   │   ├── zhihu.js
│   │   └── xiaohongshu.js
│   ├── harness/
│   │   ├── cases.json               # 30 个真实 case
│   │   └── run-e2e.js               # 批测执行与报告生成
│   └── run-web-task.js              # automation-web 内部入口
```

## 输入输出协议

- 输入：只接收 JSON（不再做正则/槽位意图解析）
- 输出字段：`success` `message` `has_screenshot` `screenshot` `exit_code` `timestamp` `meta`
- `meta.requires_human=true`：表示触发登录/验证码/风控，需要人工接管

示例：

```bash
node run-unified-task.js '{"site":"zhihu","action":"latest_answer","creator":"梦中的桃花源"}'
node run-unified-task.js '{"site":"zhihu","action":"search_top_answer","query":"Openclaw"}'
node run-unified-task.js '{"site":"xiaohongshu","action":"search_notes","query":"Openclaw 总结 10个用法","limit":10}'
```

## 稳定性与约束

- 单任务默认 3 分钟超时：`WEB_TASK_TIMEOUT_MS=180000`
- 默认复用已连接 Chrome（CDP `127.0.0.1:9222`）
- 批测遇到站点风控会自动降级：该站点后续 case 直接 skip，避免阻塞
- E2E 目标：允许失败，不允许卡死

## 本地运行

```bash
cd automation-web
npm install
```

确保 Chrome 已开启 9222：

```bash
open -a "Google Chrome" --args --remote-debugging-port=9222
```

执行单任务：

```bash
cd ..
node run-unified-task.js '{"site":"google","action":"search","query":"OpenClaw","limit":5}'
```

执行 30 case E2E：

```bash
cd automation-web
npm run e2e
```

报告目录：`automation-web/harness/reports/<timestamp>/`
