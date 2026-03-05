"use strict";

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

/**
 * 根据任务猜测种子 URL
 * 策略：URL 提取 > 硬编码站点 > Google 搜索
 */
function guessSeedUrl(task) {
  const text = String(task || "").trim();
  const textLower = text.toLowerCase();

  // 1. 检查是否包含 URL
  const urlMatch = text.match(/https?:\/\/\S+/i);
  if (urlMatch) return urlMatch[0];

  // 2. 硬编码常用站点
  for (const [keyword, domain] of Object.entries(COMMON_SITES)) {
    if (textLower.includes(keyword)) {
      return `https://www.${domain}/`;
    }
  }

  // 3. Google 搜索 fallback
  const searchQuery = encodeURIComponent(text);
  return `https://www.google.com/search?q=${searchQuery}&btnI=1`;
}

module.exports = {
  guessSeedUrl,
};
