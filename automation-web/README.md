# Automation Web

核心执行层：Playwright + Chrome CDP。

## 执行流

```text
run-web-task.js / run-unified-task.js
  -> engine.js
  -> workflows/{google,zhihu,xiaohongshu}.js
  -> 统一 JSON result
```

## 输入协议（JSON）

统一传入 JSON 对象，例如：

```json
{"site":"zhihu","action":"latest_answer","creator":"梦中的桃花源"}
```

支持动作：

- `google/search`
- `zhihu/follow_lookup`
- `zhihu/search`
- `zhihu/latest_answer`
- `zhihu/search_top_answer`
- `zhihu/follow_nth_post`
- `xiaohongshu/search_notes`
- `xiaohongshu/publish_note`

## 输出协议

统一返回：

- `success`
- `message`
- `has_screenshot`
- `screenshot` (base64)
- `exit_code`
- `timestamp`
- `meta`

其中 `meta.requires_human=true` 表示触发登录/验证码/风控。

## 稳定性策略

- 每个任务默认 3 分钟超时（`WEB_TASK_TIMEOUT_MS`）。
- 人机验证场景显式返回可读错误，不死循环重试。
- `WEB_KEEP_OPEN=1` 时保留页面，便于人工接管。

## E2E Harness

- `harness/cases.json`：30 个真实 case
- `harness/run-e2e.js`：批量执行、自动 skip 被风控站点、输出报告

运行：

```bash
npm run e2e
```
