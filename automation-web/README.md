# Automation Web

Agent 驱动的 Web 自动化系统 - 用自然语言控制浏览器搜索、浏览、总结

## 核心特性

- **自然语言输入**：用一句话描述任务，Agent 自动分析和执行
- **智能任务分析**：自动识别搜索意图，构建最优导航路径
- **站点配置优化**：常用站点硬编码关键信息，保证准确性和速度
- **视觉 + DOM 双模式**：结合截图和 DOM 元素，提高操作可靠性

## 快速开始

### 1. 启动浏览器

```bash
bash ../start-chrome.sh
```

### 2. 执行任务

```bash
node run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"
```

## 执行流程

系统采用 **4 阶段执行模型**：

```
用户输入: "去小红书搜索 openclaw，返回前 3 篇文章"
  ↓
【阶段 1: 任务分析】
  - 识别意图: search（明确搜索）或 browse（漫无目的浏览）
  - 提取目标站点: xiaohongshu.com
  - 提取关键词: ["openclaw"]
  - 构建目标: "获取前 3 篇文章的标题和内容"
  ↓
【阶段 2: 智能导航】
  - search 模式: 直接跳转到搜索结果页
    → https://www.xiaohongshu.com/search?q=openclaw
  - browse 模式: 跳转到站点首页
    → https://www.xiaohongshu.com/explore
  ↓
【阶段 3: Agent 执行循环】
  每一步:
    1. 收集页面状态（DOM 元素 + 站点配置）
    2. Agent 决策下一步操作
    3. 执行操作: click / type / extract / close / done
    4. 记录历史，检测循环
  循环直到任务完成或达到最大步数
  ↓
【阶段 4: 结果总结】
  - 汇总提取的数据（如果有 extract 操作）
  - 生成结构化输出
  - 返回执行结果
```

## 站点配置

系统对常用站点进行了硬编码优化（`core/site-config.js`），提供：

### 1. 搜索 URL 模板

支持直接构建搜索结果页 URL，跳过手动输入搜索框的步骤：

```javascript
"xiaohongshu.com": {
  search_url: "https://www.xiaohongshu.com/search?q={query}",
  browse_url: "https://www.xiaohongshu.com/explore"
}
```

### 2. 关键选择器

为信息提取提供准确的选择器：

```javascript
selectors: {
  article_list: ".note-item",      // 文章列表容器
  article_title: ".title",         // 文章标题
  article_content: ".content",     // 文章内容
  login_modal: ".login-modal",     // 登录弹窗
  login_close_button: ".close-btn" // 关闭按钮
}
```

### 3. 支持的站点

- 小红书 (xiaohongshu.com)
- 知乎 (zhihu.com)
- B站 (bilibili.com)
- 闲鱼 (goofish.com)
- 淘宝 (taobao.com)
- 京东 (jd.com)
- 微博 (weibo.com)
- 抖音 (douyin.com)

## 输出协议

统一 JSON 格式：

```json
{
  "success": true,
  "message": "任务完成描述",
  "exit_code": 0,
  "timestamp": "2026-03-05T14:00:00.000Z",
  "meta": {
    "task": "原始任务描述",
    "extracted_count": 3,
    "extraction_file": "/path/to/extracted/data.txt",
    "steps": [
      {"step": 1, "action": "goto", "url": "..."},
      {"step": 2, "action": "type", "text": "..."},
      {"step": 3, "action": "extract", "label": "..."}
    ]
  }
}
```

## 环境变量

```bash
# Agent 后端选择
OWA_AGENT_BACKEND=claude        # claude | auto (默认 auto)

# 模型选择
OWA_AGENT_MODEL=claude-sonnet-4-6  # 默认 claude-sonnet-4-6

# 最大执行步数
OWA_AGENT_MAX_STEPS=15          # 默认 15

# Claude API 密钥
ANTHROPIC_API_KEY=sk-ant-...

# 浏览器 CDP 地址
WEB_CDP_URL=http://127.0.0.1:9222  # 默认 http://127.0.0.1:9222
```

## 示例

### 搜索任务

```bash
# 小红书搜索
node run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容"

# 知乎搜索
node run-agent-task.js "在知乎搜索 AI Agent，找到最热门的 5 个回答"

# B站搜索
node run-agent-task.js "去B站搜索编程教程，返回播放量最高的 3 个视频"
```

### 浏览任务

```bash
# 浏览首页
node run-agent-task.js "打开小红书首页，看看有什么热门内容"

# 浏览特定页面
node run-agent-task.js "去知乎看看今天的热榜"
```

## 架构说明

详见 [CLAUDE.md](./CLAUDE.md) - 开发者指南
