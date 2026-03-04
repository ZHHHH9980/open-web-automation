#!/usr/bin/env node
/**
 * 智能反馈系统
 *
 * 根据任务执行方式决定是否询问反馈：
 * - 配置模式（DOM 操作）→ 不询问（成功率高）
 * - 完全动态模式（视觉识别）→ 主动询问（可能有问题）
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PATTERNS_FILE = path.join(__dirname, '../learning/data/patterns.jsonl');
const FEEDBACK_FILE = path.join(__dirname, '../learning/data/feedback.jsonl');

async function askFeedback(taskResult, page) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
  }

  console.error('\n=== 任务反馈 ===');
  console.error(`任务: ${taskResult.task}`);
  console.error(`结果: ${taskResult.success ? '成功' : '失败'}`);
  console.error(`耗时: ${(taskResult.duration / 1000).toFixed(1)}秒`);
  console.error(`步骤数: ${taskResult.steps?.length || 0}`);

  if (taskResult.steps && taskResult.steps.length > 0) {
    const errorSteps = taskResult.steps.filter(s => s.error);
    if (errorSteps.length > 0) {
      console.error(`错误步骤: ${errorSteps.length}`);
    }
  }

  console.error('');
  const satisfied = await question('任务是否成功完成？(y/n): ');

  if (satisfied.toLowerCase() === 'y') {
    const feedback = {
      timestamp: new Date().toISOString(),
      taskId: taskResult.timestamp,
      satisfied: true,
      rating: 5,
      comment: ''
    };

    fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(feedback) + '\n');
    console.error('✓ 反馈已记录\n');
    rl.close();
    return { satisfied: true };
  } else {
    const reason = await question('失败原因: ');

    // 询问是否需要继续尝试
    const wantCorrection = await question('\n是否需要提供线索让 Agent 继续尝试？(y/n): ');

    if (wantCorrection.toLowerCase() === 'y') {
      rl.close();

      // 启动交互式纠正
      const { askForCorrection } = require('./interactive-correction');
      const correction = await askForCorrection(taskResult, page);

      if (correction) {
        return {
          satisfied: false,
          needCorrection: true,
          correction,
          reason: reason.trim()
        };
      }
    }

    const feedback = {
      timestamp: new Date().toISOString(),
      taskId: taskResult.timestamp,
      satisfied: false,
      rating: 1,
      comment: reason.trim()
    };

    fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(feedback) + '\n');
    console.error('✓ 反馈已记录，系统不会学习这次失败的任务\n');
    rl.close();
    return { satisfied: false };
  }
}

/**
 * 判断是否需要询问反馈
 */
function shouldAskFeedback(result) {
  // 如果使用了配置模式，不询问（成功率高）
  if (result.meta?.used_config) {
    return false;
  }

  // 如果任务失败，询问
  if (!result.success) {
    return true;
  }

  // 如果有错误步骤，询问
  const hadErrors = result.meta?.steps?.some(s => s.error);
  if (hadErrors) {
    return true;
  }

  // 如果超时，询问
  if (result.exit_code === 124) {
    return true;
  }

  // 如果步骤数过多（>10），可能有问题，询问
  if (result.meta?.steps?.length > 10) {
    return true;
  }

  // 其他情况不询问
  return false;
}

module.exports = {
  askFeedback,
  shouldAskFeedback
};

// 如果直接运行，读取最近一次任务并询问
if (require.main === module) {
  (async () => {
    const lines = fs.readFileSync(PATTERNS_FILE, 'utf8').split('\n').filter(Boolean);
    if (lines.length === 0) {
      console.log('没有找到任务记录');
      return;
    }

    const lastTask = JSON.parse(lines[lines.length - 1]);
    await askFeedback(lastTask);
  })();
}
