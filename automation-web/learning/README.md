# Learning System - 自适应学习系统

## 设计理念

**实用主义：硬编码 + 成功学习**

系统采用三层策略：

1. **硬编码常用站点**（优先级最高）- 快速、准确
2. **成功任务学习**（个性化扩展）- 自动积累
3. **Google 搜索**（兜底）- 通用方案

### 为什么这样设计？

- 用户常用的站点就那么十几个（B站、知乎、小红书等）
- 硬编码这些站点可以立即使用，无需学习
- 成功任务学习作为扩展，支持个性化需求
- 避免因失败任务记住错误的站点

## 完整工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                        用户任务                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  1. 任务执行                                                 │
│     - 检查硬编码站点（立即匹配）                              │
│     - 检查学习到的站点（3次成功）                             │
│     - Google 搜索（兜底）                                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 自动推断满意度                                           │
│     - 任务成功？(±0.3)                                       │
│     - 步骤数合理？(±0.1)                                     │
│     - 执行时间快？(±0.1)                                     │
│     - 没有错误？(±0.1)                                       │
│     - 需要人工介入？(-0.4)                                   │
│     → 计算置信度分数 (0-1)                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 记录到 patterns.jsonl                                    │
│     - 任务描述                                               │
│     - 最终 URL                                               │
│     - 执行步骤                                               │
│     - 推断的满意度                                           │
│     - 提取的特征（域名、动作序列）                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 分析与沉淀                                               │
│     - 按域名分组统计                                         │
│     - 只保留：成功次数 >= 3 且置信度 >= 0.7                  │
│     - 生成站点配置（URL、优先级）                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  5. 下次任务自动复用                                         │
│     - 硬编码站点优先                                         │
│     - 学习到的站点次之                                       │
│     - Google 搜索兜底                                        │
└─────────────────────────────────────────────────────────────┘
```

## 架构设计

```
用户任务: "打开B站"
  ↓
检查硬编码: COMMON_SITES["b站"] = "bilibili.com"
  ↓
直接跳转: https://www.bilibili.com/
```

```
用户任务: "打开某个小众网站"
  ↓
检查硬编码: 没有
  ↓
检查学习记录: 成功访问过 3 次？
  ↓
有 → 直接跳转 | 没有 → Google 搜索
```

## 文件结构

```
learning/
├── README.md              # 本文档
├── system.js              # 核心逻辑
├── data/                  # 数据存储
│   ├── patterns.jsonl     # 学习到的执行模式
│   └── feedback.jsonl     # 用户显式反馈（可选）
└── tools/                 # 工具脚本
    ├── feedback.js        # 手动反馈收集
    └── analyze.js         # 数据分析工具
```

## 数据格式

### patterns.jsonl

每行一个 JSON 对象，记录一次任务执行：

```json
{
  "timestamp": "2026-03-04T12:30:00.000Z",
  "task": "搜索知乎上关于 AI 的讨论",
  "url": "https://www.zhihu.com/search?q=AI",
  "success": true,
  "steps": [
    {"step": 1, "action": "goto", "note": "goto https://www.zhihu.com/"},
    {"step": 2, "action": "type", "note": "type input#search"},
    {"step": 3, "action": "press", "note": "press Enter"},
    {"step": 4, "action": "done", "note": "done"}
  ],
  "duration": 15000,
  "inferredSatisfaction": true,
  "confidenceScore": 0.8,
  "confidenceReasons": [
    "task_succeeded",
    "optimal_steps",
    "fast_execution",
    "no_errors"
  ],
  "features": {
    "keywords": ["知乎", "ai", "讨论"],
    "domain": "zhihu.com",
    "actionSequence": ["goto", "type", "press", "done"]
  }
}
```

### feedback.jsonl（可选）

用户显式反馈，优先级高于自动推断：

```json
{
  "timestamp": "2026-03-04T12:31:00.000Z",
  "taskId": 1709557800000,
  "satisfied": true,
  "rating": 5,
  "comment": "完美完成任务"
}
```

## 满意度推断算法

系统通过以下指标自动推断任务满意度：

| 指标 | 权重 | 说明 |
|------|------|------|
| 任务成功 | ±0.3 | `success: true` 加分，`false` 减分 |
| 步骤数合理 | ±0.1 | 3-10 步最佳，>15 步减分 |
| 执行时间 | ±0.1 | <60 秒加分，>120 秒减分 |
| 无错误重试 | ±0.1 | 没有错误加分，有错误减分 |
| 需要人工介入 | -0.4 | 触发登录/验证码大幅减分 |

**置信度阈值：**
- `>= 0.7`：高置信度，用于沉淀配置
- `0.6 - 0.7`：中等置信度，记录但不沉淀
- `< 0.6`：低置信度，认为不满意

## 沉淀规则

站点配置的生成条件：

1. **成功次数 >= 3**：至少 3 次成功访问
2. **置信度 >= 0.7**：高置信度的满意任务
3. **动态优先级**：`priority = successCount × 10`

示例：

```javascript
// 知乎被成功访问 5 次
{
  "id": "zhihu_com",
  "domain": "zhihu.com",
  "keywords": ["知乎", "ai", "讨论", "搜索"],
  "url": "https://www.zhihu.com/",
  "priority": 50,  // 5 × 10
  "stats": {
    "successCount": 5,
    "avgDuration": 14500
  }
}
```

## 使用方法

### 1. 正常使用（自动学习）

```bash
# 第一次使用（配置为空，默认 Google）
node run-agent-task.js "搜索知乎上关于 AI 的讨论"

# 任务执行完成后，自动记录到 learning/data/patterns.jsonl
# 无需任何手动操作

# 第 3 次成功后，自动沉淀配置
# 下次执行类似任务时，自动跳转知乎
node run-agent-task.js "知乎搜索 Claude"
```

### 2. 查看学习到的配置

```bash
# 查看当前生效的站点配置
node -e "console.log(JSON.stringify(require('./learning/system').getActiveConfig(), null, 2))"

# 输出示例：
{
  "generated_at": "2026-03-04T12:30:00.000Z",
  "total_tasks": 15,
  "satisfied_tasks": 12,
  "sites": [
    {
      "id": "zhihu_com",
      "domain": "zhihu.com",
      "keywords": ["知乎", "ai"],
      "url": "https://www.zhihu.com/",
      "priority": 50
    }
  ]
}
```

### 3. 查看原始数据

```bash
# 查看所有执行记录
cat learning/data/patterns.jsonl | jq .

# 统计成功率
cat learning/data/patterns.jsonl | jq -s 'map(select(.success)) | length'

# 查看特定域名的记录
cat learning/data/patterns.jsonl | jq 'select(.features.domain == "zhihu.com")'
```

### 4. 手动反馈（可选）

如果自动推断不准确，可以手动纠正：

```bash
# 标记为满意
node learning/tools/feedback.js --satisfied --rating 5 --comment "完美"

# 标记为不满意
node learning/tools/feedback.js --not-satisfied --rating 2 --comment "没找到内容"
```

### 5. 数据分析

```bash
# 运行分析工具（待实现）
node learning/tools/analyze.js

# 输出示例：
# 总任务数: 50
# 成功率: 80%
# 平均执行时间: 18.5 秒
#
# 热门站点:
#   1. zhihu.com (15 次, 优先级 150)
#   2. google.com (10 次, 优先级 100)
#   3. xiaohongshu.com (5 次, 优先级 50)
```

## 调试模式

启用学习系统调试输出：

```bash
# 方式 1：环境变量
export OWA_LEARNING_DEBUG=1
node run-agent-task.js "任务描述"

# 方式 2：命令行参数
node run-agent-task.js --debug-mode=true "任务描述"

# 输出示例：
# [learning] 满意度推断: ✓ (置信度: 80%)
# [learning] 原因: task_succeeded, optimal_steps, fast_execution, no_errors
```

## 配置清理

如果学习到的配置不准确，可以手动清理：

```bash
# 清空所有学习数据（重新开始）
rm learning/data/patterns.jsonl
rm learning/data/feedback.jsonl

# 或者只删除特定站点的记录
cat learning/data/patterns.jsonl | jq 'select(.features.domain != "example.com")' > temp.jsonl
mv temp.jsonl learning/data/patterns.jsonl
```

## 扩展性

### 添加自定义推断规则

编辑 `learning/system.js` 中的 `inferSatisfaction()` 函数：

```javascript
// 示例：添加"用户停留时间"指标
if (taskData.userStayTime && taskData.userStayTime > 30000) {
  score += 0.1;
  reasons.push("user_stayed_long");
}
```

### 调整沉淀阈值

```javascript
// 在 analyzeAndGenerateConfig() 中修改
if (stats.count < 3) return;  // 改为 5 次
if (p.confidenceScore >= 0.7) // 改为 0.8
```

### 集成外部反馈

```javascript
// 从外部系统获取反馈
const externalFeedback = await fetchFromAPI(taskId);
recordFeedback(taskId, externalFeedback);
```

## 性能考虑

- **文件大小**：JSONL 格式，每行独立，易于追加和读取
- **内存占用**：只加载最近的记录（默认 100 条）
- **计算开销**：配置生成是懒加载的，只在需要时计算
- **并发安全**：使用 `appendFileSync` 保证写入原子性

## 隐私与安全

- **本地存储**：所有数据存储在本地，不上传
- **敏感信息**：不记录页面内容，只记录 URL 和元数据
- **可删除**：用户可随时删除 `learning/data/` 目录

## 未来改进

- [ ] 支持多用户配置隔离
- [ ] 添加站点特定的选择器策略学习
- [ ] 支持动作序列模式识别（常见操作流程）
- [ ] 集成强化学习算法（A/B 测试不同策略）
- [ ] 可视化分析面板
- [ ] 导出/导入配置（团队共享）

## 常见问题

### Q: 为什么初始状态不预设常用站点？

A: 预设站点是一种假设，不同用户的使用习惯完全不同。让系统从实际使用中学习，才能真正个性化。

### Q: 如果自动推断错误怎么办？

A: 可以使用 `learning/tools/feedback.js` 手动纠正。显式反馈的优先级高于自动推断。

### Q: 学习到的配置会影响其他用户吗？

A: 不会。每个用户的 `learning/data/` 目录是独立的。

### Q: 如何重置学习系统？

A: 删除 `learning/data/` 目录即可，系统会重新开始学习。

### Q: 学习系统会拖慢任务执行吗？

A: 不会。记录操作是异步的，失败也不影响主流程。

## 贡献

欢迎提交 Issue 和 PR 改进学习系统！

## License

MIT
