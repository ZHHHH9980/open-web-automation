"use strict";

const fs = require("fs");
const path = require("path");

const PATTERNS_FILE = path.join(__dirname, "data", "patterns.jsonl");
const FEEDBACK_FILE = path.join(__dirname, "data", "feedback.jsonl");

// 硬编码常用站点（快速启动）
const COMMON_SITES = {
  "b站": "bilibili.com",
  "bilibili": "bilibili.com",
  "哔哩": "bilibili.com",
  "知乎": "zhihu.com",
  "zhihu": "zhihu.com",
  "小红书": "xiaohongshu.com",
  "xhs": "xiaohongshu.com",
  "rednote": "xiaohongshu.com",
  "闲鱼": "goofish.com",
  "xianyu": "goofish.com",
  "goofish": "goofish.com",
  "淘宝": "taobao.com",
  "taobao": "taobao.com",
  "拼多多": "pinduoduo.com",
  "pinduoduo": "pinduoduo.com",
  "微博": "weibo.com",
  "weibo": "weibo.com",
  "抖音": "douyin.com",
  "douyin": "douyin.com",
  "京东": "jd.com",
  "jd": "jd.com",
};

// 确保文件存在
function ensureFiles() {
  [PATTERNS_FILE, FEEDBACK_FILE].forEach(file => {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "", "utf8");
  });
}

/**
 * 记录任务执行结果（自动推断满意度）
 */
function recordExecution(taskData) {
  ensureFiles();

  // 自动推断满意度
  const confidence = inferSatisfaction(taskData);

  const record = {
    timestamp: new Date().toISOString(),
    task: taskData.task,
    url: taskData.finalUrl,
    success: taskData.success,
    steps: taskData.steps,
    duration: taskData.duration,
    // 自动推断的满意度
    inferredSatisfaction: confidence.satisfied,
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
    // 提取特征
    features: extractFeatures(taskData),
  };

  fs.appendFileSync(PATTERNS_FILE, JSON.stringify(record) + "\n", "utf8");
  return record;
}

/**
 * 从执行结果推断用户满意度
 */
function inferSatisfaction(taskData) {
  const reasons = [];
  let score = 0.5;

  if (taskData.success) {
    score += 0.3;
    reasons.push("task_succeeded");
  } else {
    score -= 0.3;
    reasons.push("task_failed");
  }

  const stepCount = (taskData.steps || []).length;
  if (stepCount >= 3 && stepCount <= 10) {
    score += 0.1;
    reasons.push("optimal_steps");
  } else if (stepCount > 15) {
    score -= 0.1;
    reasons.push("too_many_steps");
  }

  if (taskData.duration && taskData.duration < 60000) {
    score += 0.1;
    reasons.push("fast_execution");
  } else if (taskData.duration > 120000) {
    score -= 0.1;
    reasons.push("slow_execution");
  }

  const hasErrors = (taskData.steps || []).some(s => s.error);
  if (!hasErrors) {
    score += 0.1;
    reasons.push("no_errors");
  } else {
    score -= 0.1;
    reasons.push("had_errors");
  }

  if (taskData.requiresHuman) {
    score -= 0.4;
    reasons.push("requires_human");
  }

  score = Math.max(0, Math.min(1, score));

  return {
    satisfied: score >= 0.6,
    score,
    reasons,
  };
}

/**
 * 记录用户反馈
 */
function recordFeedback(taskId, feedback) {
  ensureFiles();

  const record = {
    timestamp: new Date().toISOString(),
    taskId,
    satisfied: feedback.satisfied,
    rating: feedback.rating,
    comment: feedback.comment || "",
  };

  fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(record) + "\n", "utf8");
  return record;
}

/**
 * 从任务中提取特征（只记录客观事实）
 */
function extractFeatures(taskData) {
  const features = {
    domain: null,
    actionSequence: [],
  };

  try {
    const url = new URL(taskData.finalUrl || "");
    features.domain = url.hostname.replace(/^www\./, "");
  } catch (_err) {
    // ignore
  }

  if (taskData.steps && Array.isArray(taskData.steps)) {
    features.actionSequence = taskData.steps.map(s => s.action);
  }

  return features;
}

/**
 * 获取学习到的站点（只包含成功的任务）
 */
function getLearnedSites() {
  ensureFiles();
  const patterns = loadJsonLines(PATTERNS_FILE);
  const feedbacks = loadJsonLines(FEEDBACK_FILE);

  // 只返回满意的任务
  const satisfiedTasks = patterns.filter(p => {
    const explicitFeedback = feedbacks.find(f =>
      Math.abs(new Date(f.timestamp) - new Date(p.timestamp)) < 60000
    );

    if (explicitFeedback) {
      return explicitFeedback.satisfied;
    }

    return p.inferredSatisfaction && p.confidenceScore >= 0.7;
  });

  // 按域名分组
  const byDomain = {};
  satisfiedTasks.forEach(task => {
    const domain = task.features?.domain;
    if (!domain) return;

    if (!byDomain[domain]) {
      byDomain[domain] = [];
    }
    byDomain[domain].push({
      task: task.task,
      url: task.url,
      timestamp: task.timestamp,
    });
  });

  return byDomain;
}

/**
 * 根据任务猜测种子 URL
 * 策略：硬编码 > 成功学习 > Google 搜索
 */
function guessSeedUrl(task) {
  const text = String(task || "").trim();
  const textLower = text.toLowerCase();

  // 1. 检查是否包含 URL
  const urlMatch = text.match(/https?:\/\/\S+/i);
  if (urlMatch) return urlMatch[0];

  // 2. 硬编码常用站点（优先级最高）
  for (const [keyword, domain] of Object.entries(COMMON_SITES)) {
    if (textLower.includes(keyword)) {
      return `https://www.${domain}/`;
    }
  }

  // 3. 从成功任务中学习（个性化扩展）
  const learnedSites = getLearnedSites();

  for (const [domain, tasks] of Object.entries(learnedSites)) {
    if (tasks.length < 3) continue; // 至少3次成功

    const domainKeyword = domain.split(".")[0];
    if (textLower.includes(domainKeyword)) {
      return tasks[0].url.split("?")[0].split("#")[0];
    }
  }

  // 4. Google 搜索 fallback
  const searchQuery = encodeURIComponent(text);
  return `https://www.google.com/search?q=${searchQuery}&btnI=1`;
}

/**
 * 判断 URL 是否被管理
 */
function isManagedUrl(url) {
  const u = String(url || "");

  // 特殊 URL 始终管理
  if (
    u.startsWith("about:blank") ||
    u.startsWith("chrome://newtab") ||
    u.startsWith("chrome-error://")
  ) {
    return true;
  }

  // 检查硬编码站点
  for (const domain of Object.values(COMMON_SITES)) {
    if (u.includes(domain)) return true;
  }

  // 检查学习到的站点
  const learnedSites = getLearnedSites();
  return Object.keys(learnedSites).some(domain => u.includes(domain));
}

/**
 * 获取当前配置（用于调试）
 */
function getActiveConfig() {
  const learnedSites = getLearnedSites();

  const sites = Object.entries(learnedSites)
    .filter(([_, tasks]) => tasks.length >= 3)
    .map(([domain, tasks]) => ({
      id: domain.replace(/\./g, "_"),
      domain,
      url: tasks[0].url.split("?")[0].split("#")[0],
      source: "learned",
      priority: tasks.length * 10,
      stats: {
        successCount: tasks.length,
        recentTasks: tasks.slice(-5).map(t => t.task),
      }
    }))
    .sort((a, b) => b.priority - a.priority);

  // 添加硬编码站点
  Object.entries(COMMON_SITES).forEach(([keyword, domain]) => {
    if (!sites.some(s => s.domain === domain)) {
      sites.push({
        id: domain.replace(/\./g, "_"),
        domain,
        url: `https://www.${domain}/`,
        source: "hardcoded",
        priority: 100,
        keywords: [keyword],
      });
    }
  });

  return {
    generated_at: new Date().toISOString(),
    total_tasks: loadJsonLines(PATTERNS_FILE).length,
    satisfied_tasks: Object.values(learnedSites).flat().length,
    sites: sites.sort((a, b) => b.priority - a.priority)
  };
}

// 辅助函数
function loadJsonLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .split("\n")
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (_err) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_err) {
    return [];
  }
}

module.exports = {
  recordExecution,
  recordFeedback,
  getLearnedSites,
  getActiveConfig,
  guessSeedUrl,
  isManagedUrl,
};
