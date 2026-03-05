# Task Analysis 重构 - 改动说明

## 改动时间
2026-03-05

## 核心改进

### 1. 新增任务分析阶段（Step 0）

**新文件：`core/task-analyzer.js`**
- Agent 在执行前先分析任务意图
- 输出结构化的任务理解：
  ```javascript
  {
    intent: "search" | "browse",  // 明确搜索 vs 漫无目的浏览
    target_site: "xiaohongshu.com",
    keywords: ["openclaw"],
    goal: "获取前3篇文章的标题和内容"
  }
  ```

**日志输出示例：**
```
[agent] analyzing task intent...
[analysis] intent: search
[analysis] target_site: xiaohongshu.com
[analysis] keywords: openclaw
[analysis] goal: 获取前3篇文章的标题和内容
```

### 2. 新增站点配置系统

**新文件：`core/site-config.js`**
- 硬编码常用站点的搜索/浏览 URL 模式
- 硬编码关键选择器（提高准确性）
- 支持登录弹窗自动关闭

**配置结构：**
```javascript
{
  "xiaohongshu.com": {
    search_url: "https://www.xiaohongshu.com/search?q={query}",
    browse_url: "https://www.xiaohongshu.com/explore",
    selectors: {
      article_list: ".note-item",
      article_title: ".title",
      article_content: ".content",
      login_modal: ".login-modal",
      login_close_button: ".login-modal .close-btn"
    }
  }
}
```

### 3. 调整主流程（llm-agent.js）

**Step 0: 任务分析**
- 在浏览器连接后立即调用 `analyzeTask()`
- 打印分析结果日志

**Step 1: 基于分析结果导航**
- **search 模式**：直接构造 `?q=xxx` URL，跳过搜索框交互
- **browse 模式**：打开配置的 browse_url
- **登录弹窗**：如果有配置，自动关闭（不需要截图识别）

**移除旧逻辑：**
- 删除了 `guessSeedUrl()` 的自动调用
- 删除了 Step 1 的特殊处理（seed_navigation）

### 4. 简化 Prompt（core/prompt-builder.js）

**移除：**
- 所有关于"截图优先"、"视觉识别"的强调
- 坐标点击相关的指导（`x, y` 参数）
- 冗长的"Vision-Enabled Automation"说明

**新增：**
- 任务分析上下文（intent, goal, keywords）
- 站点配置选择器（如果有）
- 更简洁的规则说明

**效果：**
- Prompt 从 ~180 行减少到 ~120 行
- 去掉截图依赖，降低成本和延迟

## 调用链路变化

### 之前
```
用户输入 → guessSeedUrl(字符串匹配) → goto → Agent 开始决策
```

### 现在
```
用户输入 → analyzeTask(LLM 分析) → 构造 URL → goto → 自动关闭登录弹窗 → Agent 开始决策
```

## 示例对比

### 输入
```bash
node run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
```

### 之前的日志
```
[agent] task started: 去小红书搜索 openclaw...
[agent] seed navigation -> https://www.xiaohongshu.com/
[agent] step 1/15 url=https://www.xiaohongshu.com/ planning...
```

### 现在的日志
```
[agent] task started: 去小红书搜索 openclaw...
[agent] analyzing task intent...
[analysis] intent: search
[analysis] target_site: xiaohongshu.com
[analysis] keywords: openclaw
[analysis] goal: 获取前3篇文章的标题和内容
[agent] search mode: https://www.xiaohongshu.com/search?q=openclaw
[agent] closed login modal
[agent] step 1/15 url=https://www.xiaohongshu.com/search?q=openclaw planning...
```

## 优势

1. **更智能**：Agent 先"思考"再"行动"，理解任务意图
2. **更快速**：直接构造搜索 URL，跳过搜索框交互
3. **更准确**：硬编码关键选择器，提高提取准确性
4. **更便宜**：去掉截图依赖，降低 API 成本
5. **更可维护**：站点配置集中管理，易于扩展

## 兼容性

- 保留了 `guessSeedUrl()` 作为 fallback
- 如果任务分析失败，会使用旧逻辑
- 现有的 Agent 决策逻辑完全兼容

## 后续优化

1. 原子 action 可能需要调整（根据实际测试）
2. 站点配置可以逐步扩展（添加更多站点）
3. 登录弹窗处理可以更智能（检测更多模式）
