# ARCHITECTURE.md

## 主链路

当前项目的主执行链路很简单：

```text
launcher.js
  -> flows/orchestrator.js
  -> flows/init/task-initializer.js
  -> flows/plan/task-planner.js
  -> planners/*
  -> flows/act/run-loop.js
  -> flows/act/executor.js
  -> flows/finish/finalize-task.js
```

## 模块说明

### `launcher.js`

命令行入口。

负责接收任务参数，调用 `runAgentTask()`，并输出最终 JSON 结果。

### `flows/orchestrator.js`

主调度器。

负责串起整条执行流程：

- 生成执行计划
- 解析初始 URL
- 初始化浏览器
- 进入执行循环
- 在结束后清理运行时资源

### `flows/init/task-initializer.js`

初始化阶段。

负责三件事：

- 调用 planner 生成 `analysis + plan`
- 根据任务分析结果确定初始 URL
- 连接浏览器并打开页面

### `flows/plan/task-planner.js`

计划生成层。

负责构造 prompt，约束 planner 输出统一格式的：

- `analysis`
- `plan[]`

它也会把当前支持的动作和站点 planning 信息提供给 planner。

### `planners/*`

模型后端适配层。

- `planners/index.js`：按环境变量选择后端
- `planners/claude.js`：Claude 后端
- `planners/openai.js`：OpenAI/API 后端
- `planners/codex.js`：Codex 后端

### `flows/act/run-loop.js`

执行循环。

每一步都会：

- 收集当前页面状态
- 从 `executionPlan` 取下一个动作
- 校验动作是否可执行
- 执行动作
- 记录 history
- 判断是否完成、超时或需要人工介入

### `flows/act/executor.js`

动作执行分发层。

根据 action 名称，把动作分发到对应的 action definition。

### `flows/act/actions/*`

主链路里的具体动作定义。

当前执行链路主要依赖这些动作：

- `listen`
- `goto`
- `scrape_list`
- `scrape_detail`
- `click`
- `back`
- `wait`
- `done`
- `fail`
- `pause`

### `flows/finish/finalize-task.js`

收尾阶段。

负责：

- 组装统一结果结构
- 汇总执行 history 和采集数据
- 生成最终返回值
- 按配置关闭或保留浏览器

## 补充说明

主链路的核心特点是：

- 先规划，再执行
- 执行时按 plan 顺序推进
- 数据采集以 API-first 为主
- 最终统一输出结果

如果文档和实现不一致，以这些文件中的实际代码为准。
