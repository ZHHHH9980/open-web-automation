#!/usr/bin/env node
/**
 * 从 patterns.jsonl 自动提取站点配置
 *
 * 使用方式：
 * node tools/extract-patterns.js 闲鱼
 *
 * 原理：
 * 1. 读取 patterns.jsonl 中所有成功的任务
 * 2. 筛选出指定站点的任务
 * 3. 分析操作序列，提取通用模式
 * 4. 生成配置文件
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function main() {
  const siteName = process.argv[2];

  if (!siteName) {
    console.error('用法: node tools/extract-patterns.js <站点名称>');
    console.error('示例: node tools/extract-patterns.js 闲鱼');
    process.exit(1);
  }

  console.log(`正在分析站点: ${siteName}\n`);

  // 1. 读取 patterns.jsonl
  const patternsFile = path.join(__dirname, '../learning/data/patterns.jsonl');
  const patterns = [];

  const fileStream = fs.createReadStream(patternsFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const pattern = JSON.parse(line);
        patterns.push(pattern);
      } catch (err) {
        // 跳过无效行
      }
    }
  }

  console.log(`已加载 ${patterns.length} 条记录\n`);

  // 2. 加载反馈数据
  const feedbackFile = path.join(__dirname, '../learning/data/feedback.jsonl');
  const feedbacks = [];

  if (fs.existsSync(feedbackFile)) {
    const feedbackStream = fs.createReadStream(feedbackFile);
    const feedbackRl = readline.createInterface({
      input: feedbackStream,
      crlfDelay: Infinity
    });

    for await (const line of feedbackRl) {
      if (line.trim()) {
        try {
          const feedback = JSON.parse(line);
          feedbacks.push(feedback);
        } catch (err) {
          // 跳过无效行
        }
      }
    }
  }

  console.log(`已加载 ${feedbacks.length} 条反馈\n`);

  // 3. 筛选成功的任务（排除有负面反馈的）
  const successPatterns = patterns.filter(p => {
    if (!p.success || !p.inferredSatisfaction) {
      return false;
    }

    if (!p.task.includes(siteName)) {
      return false;
    }

    // 检查是否有明确的负面反馈
    const explicitFeedback = feedbacks.find(f =>
      Math.abs(new Date(f.timestamp) - new Date(p.timestamp)) < 60000
    );

    if (explicitFeedback && !explicitFeedback.satisfied) {
      console.log(`跳过任务（有负面反馈）: ${p.task}`);
      return false;
    }

    return true;
  });

  console.log(`找到 ${successPatterns.length} 条成功记录\n`);

  if (successPatterns.length === 0) {
    console.error(`未找到站点 "${siteName}" 的成功记录`);
    process.exit(1);
  }

  // 3. 分析操作序列
  const actionSequences = successPatterns.map(p => p.features.actionSequence);
  const mostCommon = findMostCommonSequence(actionSequences);

  console.log('最常见的操作序列:');
  console.log(mostCommon.sequence.join(' → '));
  console.log(`出现次数: ${mostCommon.count}/${successPatterns.length}\n`);

  // 4. 提取 URL
  const urls = successPatterns
    .map(p => p.url)
    .filter(url => url && url.startsWith('http'));

  const baseUrl = extractBaseUrl(urls);
  console.log(`站点 URL: ${baseUrl}\n`);

  // 5. 分析详细步骤
  const detailedSteps = successPatterns
    .filter(p => p.steps && p.steps.length > 0)
    .map(p => p.steps);

  if (detailedSteps.length === 0) {
    console.error('未找到详细步骤信息');
    process.exit(1);
  }

  // 提取搜索框选择器
  const searchInputs = extractSearchInputs(detailedSteps);
  console.log('搜索框选择器候选:');
  searchInputs.forEach((count, selector) => {
    console.log(`  ${selector} (出现 ${count} 次)`);
  });

  const searchInput = getMostFrequent(searchInputs);
  console.log(`\n选择: ${searchInput}\n`);

  // 6. 生成配置
  const config = {
    name: siteName,
    url: baseUrl,
    search: {
      steps: generateSteps(mostCommon.sequence, searchInput)
    },
    listItems: null,  // 需要手动配置
    createdAt: new Date().toISOString(),
    stats: {
      extractedFrom: successPatterns.length,
      confidence: mostCommon.count / successPatterns.length
    }
  };

  // 7. 保存配置
  const configDir = path.join(__dirname, '../config/sites');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configFile = path.join(configDir, `${siteName.toLowerCase()}.json`);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

  console.log(`✓ 配置已保存到: ${configFile}\n`);
  console.log('配置内容:');
  console.log(JSON.stringify(config, null, 2));
  console.log('\n提示: listItems 需要手动配置，请运行 site-wizard.js 补充');
}

/**
 * 找到最常见的操作序列
 */
function findMostCommonSequence(sequences) {
  const counts = new Map();

  for (const seq of sequences) {
    const key = seq.join(',');
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let maxCount = 0;
  let maxSeq = null;

  for (const [key, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxSeq = key.split(',');
    }
  }

  return { sequence: maxSeq, count: maxCount };
}

/**
 * 提取基础 URL
 */
function extractBaseUrl(urls) {
  if (urls.length === 0) return null;

  // 提取域名
  const domains = urls.map(url => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname}`;
    } catch {
      return null;
    }
  }).filter(Boolean);

  // 返回最常见的域名
  const counts = new Map();
  for (const domain of domains) {
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }

  return getMostFrequent(counts);
}

/**
 * 提取搜索框选择器
 */
function extractSearchInputs(detailedSteps) {
  const selectors = new Map();

  for (const steps of detailedSteps) {
    for (const step of steps) {
      if (step.action === 'type' && step.note) {
        // 从 note 中提取选择器
        const match = step.note.match(/type (.+)/);
        if (match) {
          const selector = match[1];
          selectors.set(selector, (selectors.get(selector) || 0) + 1);
        }
      }
    }
  }

  return selectors;
}

/**
 * 获取出现次数最多的项
 */
function getMostFrequent(map) {
  let maxCount = 0;
  let maxItem = null;

  for (const [item, count] of map) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }

  return maxItem;
}

/**
 * 根据操作序列生成配置步骤
 */
function generateSteps(sequence, searchInput) {
  const steps = [];

  for (let i = 0; i < sequence.length; i++) {
    const action = sequence[i];

    switch (action) {
      case 'goto':
        // goto 由外部处理，不需要在配置中
        break;

      case 'wait':
        steps.push({ action: 'wait', ms: 1200 });
        break;

      case 'click':
        // 如果 click 在 type 之前，说明需要先点击搜索框
        if (i < sequence.indexOf('type')) {
          steps.push({ action: 'click', selector: searchInput });
        }
        break;

      case 'type':
        steps.push({
          action: 'type',
          selector: searchInput,
          clear: true
        });
        break;

      case 'press':
        steps.push({ action: 'press', key: 'Enter', selector: searchInput });
        break;

      case 'scroll':
        // scroll 通常不是搜索流程的一部分
        break;

      case 'done':
        // done 表示结束，添加最后的等待
        steps.push({ action: 'wait_for_navigation', timeout: 10000 });
        break;
    }
  }

  return steps;
}

main().catch(console.error);
