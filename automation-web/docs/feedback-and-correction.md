# 智能反馈与纠正系统

## 改进 1：循环检测

### 问题
Agent 可能陷入循环：
- 连续 3 次截图大小相同（页面没变化）
- 连续 3 次在同一个 URL
- 连续 3 次执行相同的操作

### 解决方案
系统会自动检测循环并提前中断：

```
[agent] step 6 action=click
[agent] screenshot size: 139708 bytes
[agent] step 7 action=click
[agent] screenshot size: 139708 bytes
[agent] step 8 action=click
[agent] screenshot size: 139708 bytes

[loop-detector] 检测到循环: screenshot_size_loop (3 times)
[loop-detector] 提前中断任务
```

## 改进 2：交互式纠正

### 问题
任务失败后，系统只是记录反馈就结束了，没有利用用户的知识继续尝试。

### 解决方案
引导用户提供线索，然后继续执行：

```bash
$ node run-agent-task.js "打开知乎，搜 梦中的桃花源，看看他的第一篇文章"
...
[feedback] 检测到任务使用了完全动态模式（视觉识别）

=== 任务反馈 ===
任务: 打开知乎，搜 梦中的桃花源，看看他的第一篇文章
结果: 失败
耗时: 129.4秒
步骤数: 15

最后几步操作:
  13. click
     原因: 点击用户头像区域
  14. click (失败)
     原因: 点击'用户'标签切换
  15. scroll
     原因: 向上滚动

任务是否成功完成？(y/n): n
失败原因: 一直卡在文章列表页面，没点进去看第一篇文章

是否需要提供线索让 Agent 继续尝试？(y/n): y

=== 任务失败，需要帮助 ===
任务: 打开知乎，搜 梦中的桃花源，看看他的第一篇文章
当前 URL: https://www.zhihu.com/search?type=content&q=...
已执行步骤: 15

请提供线索帮助 Agent 继续：
1. 描述当前页面状态（如：在文章列表页）
2. 描述下一步应该做什么（如：点击第一篇文章）
3. 提供关键元素的特征（如：标题包含"xxx"）

线索: 当前在搜索结果页，需要点击用户名"梦中的桃花源"进入个人主页，然后点击"文章"标签，最后点击第一篇文章

是否需要查看当前页面截图？(y/n): y
截图已保存: /tmp/open-web-automation-shots/correction.jpg
请查看截图后提供更详细的线索
补充线索: 用户名在页面左侧，是一个蓝色链接

✓ 线索已记录，继续执行任务...

[agent] step 16/30 (with user hint)
[agent] 用户提示: 当前在搜索结果页，需要点击用户名...
[agent] action=click (点击用户名)
...
```

## 工作流程

```
执行任务
  ↓
失败（超时/错误）
  ↓
询问反馈
  ↓
用户选择: 是否继续？
  ├─ 否 → 记录负面反馈，结束
  └─ 是 → 请求线索
       ↓
     用户提供线索
       ↓
     （可选）查看截图
       ↓
     继续执行（带线索）
       ↓
     成功 → 记录正面反馈
     失败 → 再次询问
```

## 线索示例

### 好的线索
```
当前在搜索结果页，需要：
1. 点击用户名"梦中的桃花源"（蓝色链接）
2. 进入个人主页后点击"文章"标签
3. 点击第一篇文章的标题
```

### 不好的线索
```
不知道，你自己看吧
```

## 优势

1. **利用用户知识**：用户知道页面状态和下一步操作
2. **减少重试成本**：不需要从头开始，从失败点继续
3. **提高成功率**：有了用户的线索，Agent 更容易成功
4. **学习机会**：成功的纠正案例可以用于改进 Agent

## 技术实现

### 循环检测
```javascript
const loopDetector = new LoopDetector();

for (let step = 1; step <= maxSteps; step++) {
  const state = await collectPageState(page, step);

  loopDetector.record({
    screenshot_size: state.screenshot_b64.length,
    url: state.url,
    action: decision.action
  });

  const loop = loopDetector.detectLoop();
  if (loop.isLoop) {
    console.error(`[loop-detector] 检测到循环: ${loop.reasons.join(', ')}`);
    break;
  }
}
```

### 交互式纠正
```javascript
const feedback = await askFeedback(taskResult, page);

if (feedback.needCorrection) {
  // 构建带线索的 prompt
  const correctionPrompt = buildCorrectionPrompt(
    originalTask,
    feedback.correction,
    currentState
  );

  // 继续执行（从失败点开始，最多再执行 15 步）
  const result = await runAgentTask(correctionPrompt, {
    continueFrom: feedback.correction.continueFrom,
    maxSteps: 15
  });
}
```

## 未来改进

1. **自动提取线索**：分析失败原因，自动生成可能的线索
2. **线索库**：积累常见失败场景的线索模板
3. **多轮纠正**：允许多次提供线索，直到成功
