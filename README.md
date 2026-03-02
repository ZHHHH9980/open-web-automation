# Open Web Automation

独立于 AutoGLM 的网页自动化项目，当前支持：Google、知乎、小红书。

## 结构

- `run-unified-task.js`：统一入口（自然语言任务）
- `automation-web/executor.js`：Playwright CDP 执行器
- `automation-web/run-web-task.js`：Web 执行器直连入口

## 快速开始

```bash
cd automation-web
npm install
```

启动已登录态 Chrome（示例）：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-agent-profile" \
  --profile-directory="Default"
```

执行任务：

```bash
node run-unified-task.js "在知乎查看关注的博主"
node run-unified-task.js "帮我看看知乎 DeepVan 这个博主的最新回答"
node run-unified-task.js "小红书搜索 露营攻略"
```

## 常用环境变量

- `WEB_CDP_URL`：默认 `http://127.0.0.1:9222`
- `WEB_KEEP_OPEN`：默认保留页面；设为 `0` 时自动关闭
- `WEB_MAX_DOMAIN_TABS`：同域标签页上限，默认 `2`
- `WEB_PUBLISH_CONFIRM=1`：允许小红书自动点击发布
