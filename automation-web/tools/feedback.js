#!/usr/bin/env node
/**
 * 任务执行后的反馈工具
 *
 * 使用方式：
 * node tools/feedback.js
 *
 * 会读取最近一次任务的执行结果，询问用户是否满意
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PATTERNS_FILE = path.join(__dirname, '../learning/data/patterns.jsonl');
const FEEDBACK_FILE = path.join(__dirname, '../learning/data/feedback.jsonl');

async function main() {
  // 读取最近一次任务
  const lines = fs.readFileSync(PATTERNS_FILE, 'utf8').split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log('没有找到任务记录');
    return;
  }

  const lastTask = JSON.parse(lines[lines.length - 1]);

  console.log('=== 任务反馈 ===\n');
  console.log(`任务: ${lastTask.task}`);
  console.log(`结果: ${lastTask.success ? '成功' : '失败'}`);
  console.log(`耗时: ${(lastTask.duration / 1000).toFixed(1)}秒`);
  console.log(`步骤数: ${lastTask.steps?.length || 0}`);
  console.log(`URL: ${lastTask.url || '无'}`);

  if (lastTask.steps && lastTask.steps.length > 0) {
    console.log('\n执行步骤:');
    lastTask.steps.slice(0, 5).forEach((step, idx) => {
      const error = step.error ? ' (失败)' : '';
      console.log(`  ${idx + 1}. ${step.action}${error}`);
    });
    if (lastTask.steps.length > 5) {
      console.log(`  ... 还有 ${lastTask.steps.length - 5} 步`);
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
  }

  console.log('\n');
  const satisfied = await question('任务是否成功完成？(y/n): ');

  if (satisfied.toLowerCase() === 'y') {
    const rating = await question('评分 (1-5): ');
    const comment = await question('备注（可选）: ');

    const feedback = {
      timestamp: new Date().toISOString(),
      taskId: lastTask.timestamp,
      satisfied: true,
      rating: parseInt(rating) || 5,
      comment: comment.trim()
    };

    fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(feedback) + '\n');
    console.log('\n✓ 反馈已记录，感谢！');
  } else {
    const reason = await question('失败原因: ');

    const feedback = {
      timestamp: new Date().toISOString(),
      taskId: lastTask.timestamp,
      satisfied: false,
      rating: 1,
      comment: reason.trim()
    };

    fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(feedback) + '\n');
    console.log('\n✓ 反馈已记录，系统不会学习这次失败的任务');
  }

  rl.close();
}

main().catch(console.error);
