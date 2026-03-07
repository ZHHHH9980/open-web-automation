# CLAUDE.md

## 这个文件的目的

这个项目不需要一份“大而全”的开发宣言。

`CLAUDE.md` 只保留三件事：

- 说明项目现在实际上是怎么工作的
- 提醒改动时不要引入过度设计
- 告诉开发者应该优先看哪些文件

## 当前项目定位

这是一个 **基于预生成计划的 Web 自动化执行器**，不是“完全自由决策的通用网页 Agent”。

当前主链路是：

1. 先让 planner 根据任务生成 `analysis + plan`
2. 再根据 plan 顺序执行动作
3. 采集 API 返回的数据
4. 汇总结果并输出统一 JSON

所以这里的重点不是“每一步都重新思考”，而是：

- 让 planner 生成更可执行的计划
- 让执行器更稳定地跑完计划
- 让站点配置和 API 提取更可靠

## 当前代码结构

最重要的文件：

- `launcher.js`：CLI 入口
- `flows/orchestrator.js`：总调度
- `flows/init/task-initializer.js`：任务分析、初始 URL、浏览器初始化
- `flows/plan/task-planner.js`：构造 planner prompt，拿回计划
- `planners/`：不同模型后端适配
- `flows/act/run-loop.js`：执行循环
- `flows/act/executor.js`：分发动作执行
- `flows/act/actions/`：动作定义与校验
- `flows/act/site-config.js`：站点 URL / API / planning 配置
- `flows/finish/`：结果整理、总结、清理

## 开发原则

### 1. 优先改配置和动作定义，不要先堆抽象

如果是站点差异，优先看：

- `flows/act/site-config.js`
- `flows/act/platform-adapter.js`
- `flows/act/actions/definitions/*`

不要一上来引入新的通用框架层。

### 2. 以 API-first 为主，不要退回重 DOM 猜测

当前实现明显偏向：

- 先监听接口
- 再从接口数据中 `scrape_list` / `scrape_detail`
- 必要时才保留少量平台特化点击

如果要增强能力，优先补：

- 站点搜索 URL
- 列表 API / 详情 API 映射
- 平台特化打开详情页逻辑

而不是做一套复杂的通用 selector 推理系统。

### 3. 计划驱动执行，不要偷偷改回“边走边规划”

`run-loop.js` 现在按 `executionPlan.shift()` 顺序执行。

这意味着新增能力时要考虑：

- planner 是否能产出这个动作
- action definition 是否能校验执行条件
- executor 是否能稳定执行

不要在执行阶段再塞入大量隐式决策，避免系统行为不可预测。

### 4. 保持失败可解释

当前系统已经区分多种失败：

- plan generation failed
- initial URL resolution failed
- planned action not executable
- human intervention required
- timeout / max steps reached

新增逻辑时，尽量延续这种风格，返回明确原因，不要只抛笼统异常。

## 改动时的建议顺序

### 新增站点支持

通常按这个顺序：

1. 在 `flows/act/site-config.js` 加站点域名、browse/search URL
2. 如果站点有稳定接口，补 `api.list` / `api.detail`
3. 在 `planning` 里说明 `preferred_flow`、`detail_open_mode`
4. 如果详情页必须点开，再补 `platform-adapter.js`
5. 验证 planner 是否会生成正确动作序列

### 新增动作

通常要同时改：

- `flows/act/actions/definitions/`
- `flows/act/actions/registry.js`
- 如有必要，更新 planner prompt 中的 action reference

### 调整结果输出

优先看：

- `flows/finish/finalize-task.js`
- `flows/finish/result.js`
- `flows/finish/conclusion-generator.js`

## 不建议继续保留的旧思路

下面这些描述如果你在旧文档里看到，应以当前代码为准：

- “每一步都重新调用 LLM 决策”
- “依赖截图和坐标点击作为主路径”
- “通用候选元素采集是核心机制”
- “存在配置模式 / 动态模式两套主执行架构”
- “项目包含独立 learning system 并自动沉淀 patterns.jsonl”

这些都不是当前仓库里的主实现。

## 一句话总结

这个项目现在最准确的理解是：

> 一个由 planner 先产出执行计划，再由 Playwright + API 采集链路执行的站点可配置 Web 自动化工具。
