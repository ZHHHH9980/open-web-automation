# 核心架构与链路

这是一个 **Agent 驱动的 Web 自动化系统**，本文档描述系统的核心链路和架构设计。

## 1. 入口层（run-agent-task.js）

```
用户输入任务 → 路由决策 → 执行 → 总结输出
```

### 两种执行模式

#### A. 配置模式（快速路径）

- 检测站点名（如"闲鱼"）
- 加载站点配置（`config/sites/闲鱼.json`）
- Phase 1：LLM 分析任务，提取搜索词
- 直接执行配置的搜索流程（无需截图）
- **成本：1 次 LLM 调用 + 0 次截图**

#### B. 完全动态模式（通用路径）

- 调用 `runAgentTask()` 进入 Agent 循环
- **成本：~$0.30（多次 LLM + 截图）**

## 2. Agent 核心循环（llm-agent.js）

```
┌─────────────────────────────────────────────────┐
│  Step 1: Seed Navigation                        │
│  - 站点识别系统猜测起始 URL（硬编码站点）        │
│  - 清理浏览器状态 → goto seed URL               │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Step 2+: Agent 循环（最多 15 步）               │
│                                                  │
│  1. 收集页面状态                                 │
│     - 截图（JPEG, quality=20）                  │
│     - 提取 DOM 候选元素（按钮、链接、输入框）    │
│     - 获取页面文本（前 2000 字符）              │
│                                                  │
│  2. Phase 1: 任务分析（首次）                    │
│     - LLM 分析任务 → 提取 hard_filters          │
│     - 提取 preferences、steps                   │
│                                                  │
│  3. Phase 2: 执行决策                           │
│     - 构建 prompt（带 plan + 截图 + history）   │
│     - LLM 返回 JSON 决策                        │
│       {action: "click", x: 350, y: 420}         │
│                                                  │
│  4. 执行动作                                     │
│     - goto/click/type/press/scroll/wait         │
│     - 坐标点击（vision）或 selector 点击（DOM） │
│                                                  │
│  5. 循环检测                                     │
│     - 检测截图大小 + URL 是否重复               │
│     - 防止无限循环                              │
│                                                  │
│  6. Phase 3: 验证（done 时）                    │
│     - 检查 hard_filters 是否满足                │
│     - 检查任务目标是否达成                      │
│     - 验证失败 → 继续执行                       │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  返回结果                                        │
│  - success/fail/pause                           │
│  - 截图、URL、步骤历史                          │
└─────────────────────────────────────────────────┘
```

## 3. 三阶段 Prompt 系统（prompts/）

### Phase 1: Analysis（分析）

- **输入**：任务描述
- **输出**：`{hard_filters, preferences, steps, target_site}`
- **作用**：提取约束条件，避免"最便宜但违反条件"的问题

### Phase 2: Execution（执行）

- **输入**：任务 + plan + 截图 + 候选元素 + history
- **输出**：`{action, x, y, target_id, reason}`
- **作用**：每步决策，vision-first（坐标优先）

### Phase 3: Verification（验证）

- **输入**：任务 + plan + 当前页面状态
- **输出**：`{verified: true/false, reason}`
- **作用**：防止过早 done，确保真正完成

## 4. 站点识别系统（learning/system.js）

**策略：URL 提取 > 硬编码站点 > Google 搜索**

### 硬编码常用站点

```javascript
const COMMON_SITES = {
  "小红书": "xiaohongshu.com",
  "知乎": "zhihu.com",
  "b站": "bilibili.com",
  "闲鱼": "goofish.com",
  "淘宝": "taobao.com",
  // ... 更多站点
};
```

### URL 猜测逻辑

1. **URL 提取**：任务中包含 `https://...` 直接使用
2. **关键词匹配**：任务包含"小红书" → `https://www.xiaohongshu.com/`
3. **Google 兜底**：未匹配到 → Google 搜索

## 5. 关键设计

1. **Vision-First**：优先用坐标点击内容，避免 DOM selector 错误
2. **3-Phase Prompt**：分析 → 执行 → 验证，提高准确性
3. **硬编码站点 + Google 兜底**：常用站点硬编码，未知站点 Google 搜索
4. **循环检测**：防止 Agent 陷入无限循环

## 6. 数据流

```
用户任务
  ↓
站点识别（硬编码 / Google）
  ↓
Agent 循环（LLM + 截图）
  ↓
总结生成（conclusion）
  ↓
返回结果
```

## 文件结构

```
automation-web/
├── run-agent-task.js      # 入口：任务执行
├── llm-agent.js           # Agent 核心循环
├── prompts/               # 三阶段 Prompt
│   ├── analysis.js        # Phase 1: 任务分析
│   ├── execution.js       # Phase 2: 执行决策
│   └── verification.js    # Phase 3: 结果验证
├── learning/              # 站点识别系统
│   └── system.js          # 硬编码站点 + URL 猜测
├── config/                # 配置系统
│   ├── manager.js         # 配置管理器
│   └── sites/             # 站点配置
│       └── 闲鱼.json      # 站点特定配置
└── core/                  # 基础设施
    ├── browser.js         # Playwright 封装
    ├── result.js          # 结果协议
    └── loop-detector.js   # 循环检测
```

## 性能特征

- **启动速度**：硬编码常用站点，零学习成本
- **代码密度**：~1000 行核心代码支撑完整的 Web 自动化
- **容错性**：Agent 自我纠错 + Google 搜索兜底

## 相关文档

- [CLAUDE.md](./CLAUDE.md) - 开发指南和约束规则
- [USAGE.md](./USAGE.md) - 详细使用说明
