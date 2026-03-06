# Agent-Driven Web Automation

## 核心理念

这是一个 **Agent 驱动的 Web 自动化系统**。系统设计遵循以下原则：

1. **Agent 优先**：所有分析、决策、学习都由 LLM Agent 负责
2. **最小化硬编码**：避免写死非强硬性场景的代码逻辑
3. **配置即文档**：用 Markdown 和 JSON 表达意图，而非代码
4. **自我进化**：Agent 通过学习系统自主积累和优化策略

## 实用主义策略

系统采用 **硬编码 + 学习 + 兜底** 三层架构：

1. **硬编码常用站点**（优先级最高）- 快速、准确、零学习成本
   - B站、知乎、小红书、闲鱼等高频站点
   - 定义在 `learning/system.js` 的 `COMMON_SITES`

2. **成功任务学习**（个性化扩展）- 自动积累用户习惯
   - 3次成功 + 0.7置信度 → 自动沉淀配置
   - 存储在 `learning/data/patterns.jsonl`

3. **Google 搜索**（兜底方案）- 通用解决方案
   - 当前两层都无法匹配时使用

**为什么这样设计？**
- 用户常用的站点就那么十几个，硬编码可以立即使用
- 学习系统作为扩展，支持长尾需求
- 避免因失败任务记住错误的站点

## 开发约束

### ✅ 应该做的

- **写 Markdown 文档**：用于描述任务、规则、策略
- **写 Skills**：可复用的 Agent 技能定义（未来）
- **写最小化的基础设施代码**：浏览器控制、结果协议、错误处理等核心层
- **让 Agent 维护 JSON**：学习数据（patterns.jsonl）、规则库（auto-corrections.jsonl）都由 Agent 自己管理
- **硬编码高频站点**：在 `COMMON_SITES` 中添加常用站点是允许的

### ❌ 不应该做的

- **不要硬编码业务逻辑**：如搜索关键词分析、内容提取规则、页面元素定位策略
- **不要写死站点特定代码**：除了 `COMMON_SITES` 的域名映射，不要写站点特定的选择器或流程
- **不要预设决策树**：让 Agent 根据上下文动态决策
- **不要手动维护规则库**：`patterns.jsonl` 和 `auto-corrections.jsonl` 由 Agent 自动维护

## 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│   Agent Layer (LLM via Claude API)                          │
│   - 动态分析页面内容                                          │
│   - 生成操作序列（goto/click/type/press/scroll/wait/done）   │
│   - 自我纠错（auto-corrections.jsonl）                       │
├─────────────────────────────────────────────────────────────┤
│   Learning System (learning/system.js)                      │
│   - 硬编码常用站点（COMMON_SITES）                           │
│   - 自动推断满意度（置信度算法）                              │
│   - 沉淀成功模式（patterns.jsonl）                           │
│   - 3次成功 → 自动配置                                       │
├─────────────────────────────────────────────────────────────┤
│   Core Engine (core/ + llm-agent.js)                        │
│   - browser.js: Playwright CDP 封装                         │
│   - result.js: 统一输出协议                                  │
│   - input.js: 输入解析                                       │
│   - llm-agent.js: Agent 循环控制                            │
└─────────────────────────────────────────────────────────────┘
```

### 各层职责

- **Agent Layer**：通过 Claude API 调用，动态分析页面，生成操作序列，自我纠错
- **Learning System**：硬编码 + 学习 + 兜底三层策略，自动推断满意度，沉淀成功模式
- **Core Engine**：Playwright + CDP 封装，统一输入输出协议，Agent 循环控制

### 当前代码量

```
总计约 1760 行 JavaScript 代码
- llm-agent.js: ~1000 行（Agent 核心逻辑）
- learning/system.js: ~250 行（学习系统）
- core/: ~400 行（浏览器控制、协议）
- run-agent-task.js: ~80 行（入口）
```

**代码密度极低**：大部分逻辑由 Agent 动态生成，代码只负责基础设施。

## 文件组织

```
automation-web/
├── CLAUDE.md              # 本文件：开发指南
├── README.md              # 用户文档：如何使用
├── run-agent-task.js      # 入口：Agent 驱动的任务执行
├── llm-agent.js           # Agent 核心：LLM 调用、决策循环、自我纠错
│
├── core/                  # 基础设施层（~400 行）
│   ├── browser.js         # Playwright CDP 封装
│   └── result.js          # 统一输出协议
│
├── learning/              # 学习系统（~250 行）
│   ├── README.md          # 学习系统详细文档
│   ├── system.js          # 学习引擎（硬编码 + 学习 + 兜底）
│   ├── data/
│   │   ├── patterns.jsonl # Agent 维护：执行记录（257KB，自动增长）
│   │   └── feedback.jsonl # Agent 维护：用户反馈（可选）
│   └── tools/
│       ├── feedback.js    # 手动反馈工具
│       └── analyze.js     # 数据分析工具
│
└── ../adapter/            # Agent 自动纠错（上层目录）
    ├── agent-action.schema.json  # 动作 Schema
    └── rules/
        └── auto-corrections.jsonl # Agent 维护：自我纠错规则
```

### 关键文件说明

**Agent 自动维护的文件（不要手动编辑）：**
- `learning/data/patterns.jsonl` - 每次任务执行后自动追加
- `adapter/rules/auto-corrections.jsonl` - Agent 发现错误时自动追加

**人工维护的文件：**
- `learning/system.js` 中的 `COMMON_SITES` - 可以添加高频站点
- `CLAUDE.md` - 开发指南
- `README.md` - 用户文档

## 开发流程

### 添加新功能

1. **不要直接写代码**，先问：这个功能能否由 Agent 动态处理？
2. 如果是分析类任务（如"提取标题"、"判断登录状态"），让 Agent 通过页面快照分析
3. 如果是高频站点，考虑添加到 `COMMON_SITES`（仅域名映射，不要添加选择器）
4. 如果是重复性任务，考虑写成 Skill 定义（未来）
5. 只有在绝对必要时（如新的浏览器 API 封装），才写 JS 代码

### 修改现有代码

1. **优先删除硬编码逻辑**，替换为 Agent 调用
2. 将写死的规则迁移到学习系统（让 Agent 自动积累）
3. 保持 `core/` 层的纯粹性：只做基础设施，不做业务决策
4. 不要修改 Agent 维护的 JSONL 文件（patterns.jsonl, auto-corrections.jsonl）

### 调试问题

1. 检查 Agent 的决策日志（`[agent]` 前缀）
2. 查看学习系统是否有相关案例：
   ```bash
   cat learning/data/patterns.jsonl | jq 'select(.features.domain == "zhihu.com")'
   ```
3. 查看 Agent 自我纠错记录：
   ```bash
   cat ../adapter/rules/auto-corrections.jsonl | tail -10
   ```
4. 启用调试模式：
   ```bash
   node run-agent-task.js --debug-mode=true "任务描述"
   # 或
   export OWA_LEARNING_DEBUG=1
   ```
5. 如果是 Agent 能力不足，优化 Prompt 或增加 Skill
6. 如果是基础设施问题，才修改 `core/` 代码

### 输出协议

系统使用统一的退出码（exit code）来表示任务执行状态：

- `0`: 成功完成 - 任务正常完成，所有目标达成
- `2`: 任务以 `pause` 结束 - 当前动作链选择暂停并返回给调用方
- `4`: 规划失败 - LLM 调用失败或无法生成有效的执行计划
- `124`: 超时 - 任务执行超过最大步数限制（默认 15 步）
- `125`: 检测到循环 - Agent 陷入重复操作循环，自动终止

退出码在 `core/result.js` 中定义，通过 JSON 输出协议返回给调用方。

### 添加新站点支持

**方式 1：自动学习（推荐）**
```bash
# 执行 3 次成功任务，系统自动学习
node run-agent-task.js "打开某个新站点"
node run-agent-task.js "在新站点搜索内容"
node run-agent-task.js "在新站点执行操作"

# 第 3 次成功后，自动沉淀配置
```

**方式 2：手动添加高频站点**
```javascript
// 编辑 learning/system.js
const COMMON_SITES = {
  // ... 现有站点
  "新站点": "newsite.com",
  "别名": "newsite.com"
};
```

**不要做：**
- ❌ 不要添加站点特定的选择器
- ❌ 不要添加站点特定的操作流程
- ❌ 不要创建 `sites/newsite.js` 这样的文件

## 示例对比

### ❌ 错误做法（硬编码业务逻辑）

```javascript
// 不要这样写！站点特定的选择器策略
function extractZhihuTitle(page) {
  const selectors = [
    '.QuestionHeader-title',
    '.ContentItem-title',
    'h1.Post-Title'
  ];
  for (const sel of selectors) {
    const el = page.querySelector(sel);
    if (el) return el.textContent;
  }
}

// 不要这样写！硬编码的搜索关键词分析
function analyzeSearchKeywords(task) {
  if (task.includes('AI')) return ['人工智能', 'AI', 'machine learning'];
  if (task.includes('编程')) return ['编程', 'programming', '代码'];
  // ...
}
```

### ✅ 正确做法（Agent 驱动）

```javascript
// 让 Agent 动态分析页面
const decision = await callAgent({
  task: "提取当前页面的标题",
  pageSnapshot: await page.content(),
  hint: "标题通常在 h1 或显著位置"
});

// 让 Agent 动态决策搜索策略
const decision = await callAgent({
  task: userTask,
  context: "需要在知乎搜索相关内容",
  currentUrl: page.url()
});
```

### ✅ 允许的硬编码（基础设施）

```javascript
// 可以硬编码：常用站点映射（learning/system.js）
const COMMON_SITES = {
  "b站": "bilibili.com",
  "知乎": "zhihu.com",
  "小红书": "xiaohongshu.com"
};

// 可以硬编码：动作类型定义（llm-agent.js）
const ALLOWED_ACTIONS = new Set([
  "goto", "click", "type", "press",
  "scroll", "wait", "done", "fail", "pause"
]);

// 可以硬编码：协议格式（core/result.js）
function toResult(success, message, meta) {
  return {
    success,
    message,
    has_screenshot: !!meta.screenshot,
    screenshot: meta.screenshot || "",
    exit_code: success ? 0 : 1,
    timestamp: new Date().toISOString(),
    meta
  };
}
```

## 关键原则

1. **代码是基础设施，不是业务逻辑**
   - 基础设施：浏览器控制、协议定义、Agent 循环
   - 业务逻辑：页面分析、元素定位、操作策略 → 由 Agent 负责

2. **Markdown 和 JSON 优先，JS 代码最后**
   - 文档：CLAUDE.md, README.md, learning/README.md
   - 数据：patterns.jsonl, auto-corrections.jsonl
   - 代码：只在必要时写

3. **Agent 能做的，就不要人工做**
   - Agent 可以分析页面 → 不要写选择器配置
   - Agent 可以学习规律 → 不要写规则引擎
   - Agent 可以自我纠错 → 不要写错误处理逻辑

4. **学习系统是第一生产力**
   - 硬编码常用站点（快速启动）
   - 自动学习成功模式（个性化）
   - Google 搜索兜底（通用性）

5. **实用主义 > 完美主义**
   - 硬编码 10 个高频站点 > 复杂的站点发现算法
   - 3 次成功沉淀 > 复杂的置信度模型
   - 简单的满意度推断 > 复杂的用户反馈系统

## 数据流

```
用户任务: "搜索知乎上关于 AI 的讨论"
  ↓
learning/system.js: guessSeedUrl()
  → 检查 COMMON_SITES["知乎"] → "zhihu.com"
  → 返回 "https://www.zhihu.com/"
  ↓
llm-agent.js: runAgentTask()
  → 调用 Claude API
  → Agent 分析页面快照
  → 生成操作序列: [goto, type, press, done]
  ↓
core/browser.js: 执行操作
  → goto: 跳转到知乎
  → type: 输入搜索关键词
  → press: 按 Enter
  → done: 完成
  ↓
learning/system.js: recordExecution()
  → 自动推断满意度（置信度 0.8）
  → 追加到 patterns.jsonl
  → 3 次成功后自动沉淀配置
  ↓
下次执行类似任务时，直接复用学习到的配置
```

## 性能特征

- **启动速度**：硬编码常用站点，零学习成本
- **学习速度**：3 次成功即可沉淀配置
- **代码密度**：1760 行代码支撑完整的 Web 自动化
- **扩展性**：通过学习系统自动扩展，无需修改代码
- **容错性**：Agent 自我纠错 + Google 搜索兜底

## 当前状态（2026-03-04）

- ✅ 核心 Agent 循环已实现（llm-agent.js）
- ✅ 学习系统已实现（learning/system.js）
- ✅ 硬编码常用站点（COMMON_SITES）
- ✅ 自动满意度推断（置信度算法）
- ✅ 自我纠错机制（auto-corrections.jsonl）
- ✅ 已积累 257KB 学习数据（patterns.jsonl）
- 🚧 Skills 系统（未来）
- 🚧 可视化分析面板（未来）

## 参考资源

- 学习系统设计：`learning/README.md`
- Agent 调用示例：`llm-agent.js`
- 任务执行流程：`run-agent-task.js`
