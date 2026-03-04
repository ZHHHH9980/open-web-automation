# 使用指南

## 首次使用（一次性配置）

### 1. 配置浏览器 profile

```bash
cd automation-web
node config/init-browser.js
```

系统会：
1. 自动检测所有 Chrome profiles（Default, Profile 1, Profile 2, Profile 3, Profile 4）
2. 让你选择要使用的 profile
3. 保存配置到 `config/browser.json`

**示例输出**：
```
=== 浏览器配置向导 ===

检测到以下 Chrome profiles:

  1. Default
  2. Profile 1
  3. Profile 2
  4. Profile 3
  5. Profile 4

请选择 profile (1-5): 5

CDP 端口 (默认 9222):

✓ 配置已保存到: config/browser.json
```

### 2. 启动浏览器

```bash
cd ..
./start-chrome.sh
```

系统会：
1. 读取 `config/browser.json`
2. 使用配置的 profile 启动 Chrome
3. 开启 CDP 端口（默认 9222）

## 日常使用

```bash
# 执行任务（系统自动判断是否使用配置）
node run-agent-task.js "打开闲鱼，搜索 iPhone 13 Pro"
```

**系统会自动**：
1. 检测站点名（闲鱼）
2. 检查是否有配置文件 `config/sites/闲鱼.json`
3. 如果有配置 → 使用配置执行（成本 $0.00，速度 3 秒）
4. 如果没有配置 → 使用完全动态模式（成本 $0.30，速度 30 秒）

## 完整工作流程

### 第一次使用某个站点

```bash
# 1. 正常执行任务（完全动态模式）
node run-agent-task.js "打开闲鱼，搜索 iPhone 13 Pro"

# 输出：
# [config] 站点 "闲鱼" 未配置
# [config] 使用完全动态模式（成本: ~$0.30）
# [config] 提示: 执行 3-5 次后运行 "node tools/config-site.js ..." 生成配置

# 2. 多执行几次，积累数据
node run-agent-task.js "打开闲鱼，搜索 Mac mini M1"
node run-agent-task.js "打开闲鱼，搜索 iPad Air"

# 3. 生成配置（一次性操作）
node tools/config-site.js "打开闲鱼，搜索 iPhone"

# 输出：
# ✓ 在历史记录中找到 53 条成功记录
# ✓ 自动提取配置
# ✓ 配置已保存到: config/sites/闲鱼.json
```

### 之后使用（自动使用配置）

```bash
# 同样的命令，但现在自动使用配置
node run-agent-task.js "打开闲鱼，搜索 iPhone 13 Pro"

# 输出：
# [config] 检测到已配置站点: 闲鱼
# [config] 使用配置执行搜索（成本: $0.00）
# [config] 搜索成功，耗时: 3200ms
```

## 成本对比

### 未配置（第 1-3 次）

```
命令：node run-agent-task.js "打开闲鱼，搜索 iPhone"

流程：
1. 检测站点：闲鱼
2. 检查配置：未找到
3. 使用完全动态模式
4. Phase 1: 任务分析（1 次 LLM）
5. Phase 2: 执行操作（5-10 次 LLM + 截图）
6. Phase 3: 验证结果（1 次 LLM）

成本：$0.30/次（7-12 次 LLM + 5-10 次截图）
速度：30 秒
```

### 已配置（第 4+ 次）

```
命令：node run-agent-task.js "打开闲鱼，搜索 iPhone16pro 的价格"

流程：
1. 检测站点：闲鱼
2. 检查配置：找到 config/sites/闲鱼.json
3. Phase 1: 任务分析（1 次 LLM，提取搜索词 "iPhone16pro"）
4. 使用配置执行搜索（0 次 LLM，纯 DOM 操作）

成本：$0.02/次（1 次 LLM + 0 次截图）
速度：8 秒

成本降低：93%（$0.30 → $0.02）
```

## 智能反馈系统

### 自动判断是否需要反馈

系统会根据执行方式智能判断：

| 执行方式 | 是否询问反馈 | 原因 |
|----------|--------------|------|
| **配置模式**（DOM 操作） | ❌ 不询问 | 成功率高，基于确定性的 DOM 操作 |
| **完全动态模式**（视觉识别） | ✅ 主动询问 | 可能有误判，需要用户确认 |

### 配置模式（不询问）

```bash
$ node run-agent-task.js "打开闲鱼，搜索 iPhone16pro 的价格"
[config] 检测到已配置站点: 闲鱼
[config] 使用配置执行搜索（成本: $0.02）
[config] 搜索成功，耗时: 7840ms
{"success":true,...}

[config] 任务使用配置模式完成，无需反馈
```

**为什么不询问**：
- 使用预定义的 DOM 选择器
- 操作确定性高
- 成功率接近 100%

### 完全动态模式（主动询问）

```bash
$ node run-agent-task.js "打开知乎，搜 梦中的桃花源"
[config] 站点 "知乎" 未配置
[config] 使用完全动态模式（成本: ~$0.30）
...
{"success":false,"exit_code":124,...}

[feedback] 检测到任务使用了完全动态模式（视觉识别）
[feedback] 为了提高系统准确性，请确认任务是否成功

=== 任务反馈 ===
任务: 打开知乎，搜 梦中的桃花源
结果: 失败
耗时: 180.0秒
步骤数: 15
错误步骤: 3

任务是否成功完成？(y/n): n
失败原因: 页面有弹窗遮挡，无法点击目标元素
✓ 反馈已记录，系统不会学习这次失败的任务
```

**为什么询问**：
- 使用视觉识别（截图 + LLM）
- 可能被弹窗、广告、动态内容干扰
- 需要用户确认结果

### 触发反馈的条件

系统会在以下情况主动询问：

1. **任务失败**
2. **有错误步骤**（点击失败、超时等）
3. **任务超时**（达到最大步骤数）
4. **步骤数过多**（>10 步，可能陷入循环）

### 反馈的作用

1. **防止错误学习**：
   ```bash
   # 有负面反馈的任务不会被用于生成配置
   $ node tools/extract-patterns.js 知乎
   跳过任务（有负面反馈）: 打开知乎，搜 梦中的桃花源
   找到 5 条成功记录（排除 1 条负面反馈）
   ```

2. **提高配置质量**：
   - 只有真正成功的任务才会被学习
   - 配置生成基于高质量的成功案例

3. **改进系统**：
   - 反馈数据可以用于优化 Agent 行为
   - 识别常见失败模式

### 手动反馈

如果需要手动提供反馈：

```bash
node tools/feedback.js
```

## 配置站点

```bash
# 自动判断配置方式
node tools/config-site.js "打开闲鱼，搜索 iPhone"

# 如果有 ≥3 条成功记录 → 自动提取配置
# 如果没有历史记录 → 打开浏览器，引导你点击（5 分钟）
```

## 命令总结

| 命令 | 用途 | 何时使用 |
|------|------|----------|
| `node run-agent-task.js "任务"` | 执行任务 | 任何时候（系统自动判断是否使用配置） |
| `node tools/config-site.js "任务"` | 生成配置 | 执行 3-5 次后，一次性运行 |

## 优势

1. **零学习成本**：只需要记住一个命令 `run-agent-task.js`
2. **自动优化**：系统自动判断是否使用配置
3. **渐进式**：
   - 第 1-3 次：完全动态（成本高，但积累数据）
   - 第 4 次：运行 `config-site.js` 生成配置
   - 第 5+ 次：自动使用配置（成本降低 100%）

## 示例

```bash
# 第 1 次：完全动态模式
$ node run-agent-task.js "打开闲鱼，搜索 iPhone"
[config] 站点 "闲鱼" 未配置
[config] 使用完全动态模式（成本: ~$0.30）
✓ 任务完成

# 第 2-3 次：继续积累数据
$ node run-agent-task.js "打开闲鱼，搜索 Mac mini"
$ node run-agent-task.js "打开闲鱼，搜索 iPad"

# 生成配置
$ node tools/config-site.js "打开闲鱼，搜索 iPhone"
✓ 在历史记录中找到 53 条成功记录
✓ 配置已保存

# 第 4+ 次：自动使用配置
$ node run-agent-task.js "打开闲鱼，搜索 iPhone"
[config] 检测到已配置站点: 闲鱼
[config] 使用配置执行搜索（成本: $0.00）
✓ 搜索成功，耗时: 3200ms
```

## 技术细节

### 自动判断逻辑

```javascript
// run-agent-task.js 的逻辑
const siteName = extractSiteName(task);  // 从任务中提取站点名
const config = loadSiteConfig(siteName); // 检查是否有配置

if (config && isSearchTask(task)) {
  // 使用配置执行（快速路径）
  executeSearch(page, config, query);
} else {
  // 完全动态模式（回退路径）
  runAgentTask(task);
}
```

### 配置文件位置

```
config/sites/
├── 闲鱼.json
├── 知乎.json
└── 小红书.json
```

### 配置文件格式

```json
{
  "name": "闲鱼",
  "url": "https://www.goofish.com",
  "search": {
    "steps": [
      { "action": "wait", "ms": 1200 },
      { "action": "type", "selector": "...", "clear": true },
      { "action": "press", "key": "Enter" },
      { "action": "wait", "ms": 1200 },
      { "action": "wait_for_navigation" }
    ]
  },
  "stats": {
    "extractedFrom": 53,
    "confidence": 0.21
  }
}
```
