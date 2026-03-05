# Open Web Automation

## 核心功能

面向真实账号场景的网页自动化工具，通过 LLM Agent + Chrome CDP + Playwright 实现智能网页操作。

**主要能力**：
- 自然语言驱动的网页自动化
- 视觉识别 + DOM 操作混合模式
- 支持登录态、验证码、人机验证场景
- 自动提取和总结网页内容

## 架构设计

### 任务拆解流程

**核心思想**：将自然语言任务拆解为原子化的 actions，结合平台特定逻辑执行。

#### 1. 任务分析（Phase 1: Analysis）

**Actions 链条示例**：

任务："打开知乎帮我找我关注的博主梦中的桃花源，返回第一篇文章"

```
goto (zhihu.com)
  -> type ("梦中的桃花源" into search input)
  -> wait (1500ms for results)
  -> click (博主主页链接)
  -> wait (1000ms for page load)
  -> click (第一篇文章)
  -> extract (article content from .RichContent-inner)
  -> back (to 博主主页)
  -> done
```

#### 2. 原子化 Actions（Phase 2: Execution）

**可用的原子 actions**：
- `goto` - 导航到 URL
- `click` - 点击元素（坐标或选择器）
- `type` - 输入文本（自动按 Enter）
- `press` - 按键（Enter/Escape/Tab 等）
- `scroll` - 滚动页面
- `wait` - 等待（时间或条件）
- `back` - 返回上一页
- `extract` - 提取内容
- `done` - 任务完成
- `fail` - 任务失败
- `pause` - 暂停（需要人工介入）

#### 3. 平台化 Actions（Platform-Specific Logic）

**平台配置系统**自动注入平台特定逻辑：

**小红书（Modal 模式）**：
- 点击文章 → 打开弹窗
- 提取内容 → 使用 `.note-content` 选择器
- 返回列表 → 点击关闭按钮（不能用 back）

**知乎（Page 模式）**：
- 点击文章 → 跳转新页面
- 提取内容 → 使用 `.RichContent-inner` 选择器
- 返回列表 → 使用 back 动作

### 站点识别策略

1. **硬编码常用站点**（优先级最高）
   - B站、知乎、小红书、闲鱼、淘宝、拼多多等
   - 定义在 `learning/system.js` 的 `COMMON_SITES`

2. **Google 搜索兜底**
   - 未匹配到站点时自动 Google 搜索

### 平台配置系统

**平台差异**：
- 知乎（Page 模式）：`click (article) -> extract (content) -> back (to list)`
- 小红书（Modal 模式）：`click (article) -> extract (content) -> click (close button)`

**交互模式**：
- **Modal 模式**（如小红书）：点击打开弹窗，点击关闭按钮返回
- **Page 模式**（如知乎）：点击跳转新页面，使用 back 返回
- **SPA 模式**：单页应用，URL 变化但不刷新页面

**配置内容**：
- **workflows**：预定义的工作流
- **selectors**：选择器配置
- **special_behaviors**：特殊行为说明
- **agent_hints**：Agent 提示

## 配置方式

### 1. 首次配置（一次性）

```bash
# 启动 Chrome（开启 CDP 端口 9222）
./start-chrome.sh
```

### 2. 日常使用

```bash
# Agent 模式（自然语言）
node automation-web/run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章"
```

### 3. 环境变量

```bash
# Agent 配置
OWA_AGENT_MAX_STEPS=15          # 最大步骤数
OWA_AGENT_DEBUG=1               # 打印调试信息
OWA_AGENT_PLANNING_MODE=1       # 启用规划模式
OWA_AGENT_CODEX_MODEL=...       # 指定模型

# 浏览器配置
WEB_KEEP_OPEN=1                 # 任务完成后保持浏览器打开
WEB_KEEP_OPEN_ON_HUMAN=1        # 触发人机验证时保持打开
WEB_TASK_TIMEOUT_MS=180000      # 任务超时时间（3分钟）
WEB_NO_SCREENSHOT=1             # 禁用截图
```

## 关键设计思想

### 1. Agent 优先，最小化硬编码

**核心理念**：
- 所有分析、决策由 LLM Agent 负责
- 代码只负责基础设施（浏览器控制、协议定义）
- 业务逻辑由 Agent 动态生成

### 2. 三层 Actions 抽象

**原子 Actions** → **平台化 Actions** → **任务级 Actions**

- **原子层**：goto/click/type/press/scroll/wait/back/extract/done
- **平台层**：workflows（搜索流程、导航方式、内容提取）
- **任务层**：高层次步骤（"搜索"、"提取"）

### 3. Vision-First 策略

- 优先使用坐标点击（基于截图的视觉识别）
- 平台配置提供选择器时使用选择器（更准确）
- 截图使用 JPEG quality=20 降低成本

### 4. 平台感知

- 自动识别网站交互模式（Modal/Page/SPA）
- 根据平台配置调整 Agent 行为
- 提供平台特定的 workflows 和 selectors

### 5. 容错设计

- 循环检测：防止 Agent 陷入无限循环
- 超时保护：单任务 3 分钟超时
- 人机验证识别：`meta.requires_human=true`
- 错误自动记录：`adapter/rules/auto-corrections.jsonl`
- Replanning：执行失败时自动重新规划

## 数据流

```
用户任务（自然语言）
  ↓
Phase 1: Analysis（任务分析）
  → 识别目标站点
  → 生成 Actions 链条
  ↓
站点识别（硬编码 COMMON_SITES / Google）
  ↓
加载平台配置（platforms/*.js）
  → workflows, selectors, special_behaviors
  ↓
Phase 2: Execution（原子化执行，最多 15 步）
  ├─ 截图（JPEG quality=20）
  ├─ 提取 DOM 候选元素
  ├─ 应用平台配置
  ├─ LLM 决策（action + 参数）
  ├─ 执行原子 action
  └─ 循环检测
  ↓
Phase 3: Verification（结果验证）
  → 验证任务目标
  ↓
生成总结（Conclusion）
  → summary + links
  ↓
返回结果（JSON）
```

## 输入输出协议

### 输入

```bash
node automation-web/run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章"
```

### 输出

```json
{
  "success": true,
  "message": "任务完成",
  "exit_code": 0,
  "meta": {
    "url": "https://...",
    "steps": [...],
    "duration": 30000,
    "requires_human": false,
    "extracted": [...],
    "conclusion": {
      "summary": "...",
      "links": [...]
    }
  }
}
```

## 添加新平台

```bash
# 1. 复制模板
cp automation-web/platforms/_template.js automation-web/platforms/newsite.js

# 2. 编辑配置
# - domain: 域名
# - interaction: 交互模式（modal/page/spa）
# - workflows: 预定义工作流
# - selectors: 选择器配置
# - special_behaviors: 特殊行为
# - agent_hints: Agent 提示

# 3. 测试
node automation-web/run-agent-task.js "在新网站搜索测试"
```

## 性能特征

- **启动速度**：硬编码常用站点，零学习成本
- **容错性**：Agent 自我纠错 + Replanning + Google 兜底
- **成本**：~$0.30/任务（多次 LLM + 截图）
- **扩展性**：通过平台配置快速支持新网站

## 适用场景

✅ **适合**：
- 需要登录态的真实账号操作
- 复杂的多步骤网页任务
- 需要内容提取和总结
- 动态页面、SPA 应用
- Modal 弹窗交互

❌ **不适合**：
- 简单的 API 调用
- 需要毫秒级响应的场景
- 大规模批量爬取（成本高）
