#!/usr/bin/env node
/**
 * 交互式纠正系统
 *
 * 当任务失败时，引导用户提供线索，然后继续执行
 */

const readline = require('readline');

async function askForCorrection(taskResult, page) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
  }

  console.error('\n=== 任务失败，需要帮助 ===');
  console.error(`任务: ${taskResult.task}`);
  console.error(`当前 URL: ${taskResult.url}`);
  console.error(`已执行步骤: ${taskResult.steps?.length || 0}`);

  // 显示最终截图路径
  if (taskResult.screenshot_path) {
    console.error(`\n最终截图: ${taskResult.screenshot_path}`);
    console.error('请查看截图了解当前页面状态');
  }

  // 分析失败原因
  const lastSteps = taskResult.steps?.slice(-3) || [];
  if (lastSteps.length > 0) {
    console.error('\n最后几步操作:');
    lastSteps.forEach((step, idx) => {
      const error = step.error ? ' (失败)' : '';
      console.error(`  ${step.step}. ${step.action}${error}`);
      if (step.reason) {
        console.error(`     原因: ${step.reason}`);
      }
    });
  }

  console.error('\n');
  const wantHelp = await question('是否需要继续尝试？(y/n): ');

  if (wantHelp.toLowerCase() !== 'y') {
    rl.close();
    return null;
  }

  // 询问用户提供线索
  console.error('\n请提供线索帮助 Agent 继续：');
  console.error('1. 描述当前页面状态（如：在文章列表页）');
  console.error('2. 描述下一步应该做什么（如：点击第一篇文章）');
  console.error('3. 提供关键元素的特征（如：标题包含"xxx"）');
  console.error('');

  const hint = await question('线索: ');

  if (!hint.trim()) {
    console.error('未提供线索，放弃继续尝试');
    rl.close();
    return null;
  }

  // 如果还没有截图，询问是否需要重新截图
  let screenshot = taskResult.screenshot_path;

  if (!screenshot) {
    const needScreenshot = await question('是否需要查看当前页面截图？(y/n): ');

    if (needScreenshot.toLowerCase() === 'y' && page) {
      try {
        const { makeScreenshot } = require('../core/browser');
        const shot = await makeScreenshot(page, 'correction');
        screenshot = shot.filePath;
        console.error(`截图已保存: ${screenshot}`);
      } catch (err) {
        console.error('截图失败:', err.message);
      }
    }
  }

  // 询问是否需要补充线索
  const moreHint = await question('补充线索（可选，直接回车跳过）: ');
  let finalHint = hint.trim();
  if (moreHint.trim()) {
    finalHint += '\n' + moreHint.trim();
  }

  rl.close();

  return {
    hint: finalHint,
    screenshot,
    continueFrom: taskResult.steps?.length || 0
  };
}

/**
 * 构建纠正后的 prompt
 */
function buildCorrectionPrompt(originalTask, correction, currentState) {
  return `
原始任务: ${originalTask}

当前状态:
- URL: ${currentState.url}
- 已执行步骤: ${correction.continueFrom}

用户提供的线索:
${correction.hint}

请根据用户的线索，继续执行任务。注意：
1. 用户已经告诉你当前的状态和下一步应该做什么
2. 仔细阅读线索，理解用户的意图
3. 如果线索提到了具体的元素特征，优先使用这些特征定位元素
`.trim();
}

module.exports = {
  askForCorrection,
  buildCorrectionPrompt
};

// 如果直接运行，测试交互
if (require.main === module) {
  (async () => {
    const mockResult = {
      task: '打开知乎，搜 梦中的桃花源，看看他的第一篇文章',
      url: 'https://www.zhihu.com/search?type=content&q=...',
      steps: [
        { step: 1, action: 'goto' },
        { step: 2, action: 'type' },
        { step: 3, action: 'press' },
        { step: 4, action: 'click', error: 'timeout' }
      ]
    };

    const correction = await askForCorrection(mockResult, null);
    if (correction) {
      console.log('\n纠正信息:');
      console.log(JSON.stringify(correction, null, 2));

      const prompt = buildCorrectionPrompt(mockResult.task, correction, mockResult);
      console.log('\n纠正后的 prompt:');
      console.log(prompt);
    }
  })();
}
