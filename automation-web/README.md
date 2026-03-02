# Web Automation Executor

基于 Playwright CDP 的网页自动化执行器，接管你已经登录的 Chrome。

## 1) 安装

```bash
cd automation-web
npm install
```

## 2) 启动 Chrome 远程调试（复用登录态）

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-agent-profile" \
  --profile-directory="Default"
```

如果你要复用已有账号，请把 `--user-data-dir` 指向你实际在用的目录。

## 3) 运行任务

```bash
node run-web-task.js "Google 搜索 OpenAI"
node run-web-task.js "在知乎查看关注的博主"
node run-web-task.js "小红书搜索 露营攻略"
node run-web-task.js "小红书发布笔记 标题:周末露营 内容:今天天气很好 图片:/tmp/a.png,/tmp/b.png"
```

默认发布任务不会点击最终发布按钮（安全模式）。

默认会保留网页标签页，方便人工接管登录/验证码。
如需自动关闭，设置 `WEB_KEEP_OPEN=0`：

```bash
WEB_KEEP_OPEN=0 node run-web-task.js "Google 搜索 OpenAI"
```

- 设置 `WEB_PUBLISH_CONFIRM=1` 才会自动点击发布：

```bash
WEB_PUBLISH_CONFIRM=1 node run-web-task.js "小红书发布笔记 标题:... 内容:... 图片:... 立即发布"
```

## 4) 返回格式

统一返回 JSON：

- `success`
- `message`
- `has_screenshot`
- `screenshot` (Base64)
- `exit_code`
- `timestamp`
- `meta` (站点、动作、结果、截图路径、是否需要人工接管)

## 5) 统一入口

项目统一入口在 `run-unified-task.js`：

- 识别自然语言任务并执行 Google/知乎/小红书操作

```bash
node /Users/a1/Documents/open-web-automation/run-unified-task.js "Google 搜索 Playwright"
```
