"use strict";

/**
 * Site-specific configuration
 * Includes search URL patterns, browse URLs, and key selectors
 */
const SITE_CONFIG = {
  "xiaohongshu.com": {
    search_url: "https://www.xiaohongshu.com/search_result?keyword={query}&source=web_explore_feed",
    browse_url: "https://www.xiaohongshu.com/explore",
    selectors: {
      article_list: ".note-item",
      article_title: ".title",
      article_content: ".content",
      login_modal: ".login-modal",
      login_close_button: ".login-modal .close-btn"
    }
  },

  "zhihu.com": {
    search_url: "https://www.zhihu.com/search?q={query}",
    browse_url: "https://www.zhihu.com/",
    selectors: {
      article_list: ".List-item",
      article_title: ".ContentItem-title",
      article_content: ".RichContent-inner",
      login_modal: ".Modal-wrapper",
      login_close_button: ".Modal-closeButton"
    }
  },

  "bilibili.com": {
    search_url: "https://search.bilibili.com/all?keyword={query}",
    browse_url: "https://www.bilibili.com/",
    selectors: {
      video_list: ".video-item",
      video_title: ".title",
      video_desc: ".desc",
      login_modal: ".bili-mini-login",
      login_close_button: ".bili-mini-close"
    }
  },

  "goofish.com": {
    search_url: "https://www.goofish.com/search?q={query}",
    browse_url: "https://www.goofish.com/",
    selectors: {
      item_list: ".item",
      item_title: ".title",
      item_price: ".price",
      login_modal: ".login-modal",
      login_close_button: ".close"
    }
  },

  "taobao.com": {
    search_url: "https://s.taobao.com/search?q={query}",
    browse_url: "https://www.taobao.com/",
    selectors: {
      item_list: ".item",
      item_title: ".title",
      item_price: ".price"
    }
  },

  "jd.com": {
    search_url: "https://search.jd.com/Search?keyword={query}",
    browse_url: "https://www.jd.com/",
    selectors: {
      item_list: ".gl-item",
      item_title: ".p-name",
      item_price: ".p-price"
    }
  },

  "weibo.com": {
    search_url: "https://s.weibo.com/weibo?q={query}",
    browse_url: "https://weibo.com/",
    selectors: {
      post_list: ".card-wrap",
      post_content: ".txt",
      login_modal: ".gn_login_layer",
      login_close_button: ".W_close"
    }
  },

  "douyin.com": {
    search_url: "https://www.douyin.com/search/{query}",
    browse_url: "https://www.douyin.com/",
    selectors: {
      video_list: ".video-item",
      video_title: ".title"
    }
  }
};

/**
 * Common site keywords mapping
 */
const COMMON_SITES = {
  "小红书": "xiaohongshu.com",
  "xhs": "xiaohongshu.com",
  "rednote": "xiaohongshu.com",
  "知乎": "zhihu.com",
  "zhihu": "zhihu.com",
  "b站": "bilibili.com",
  "bilibili": "bilibili.com",
  "哔哩": "bilibili.com",
  "闲鱼": "goofish.com",
  "xianyu": "goofish.com",
  "goofish": "goofish.com",
  "淘宝": "taobao.com",
  "taobao": "taobao.com",
  "京东": "jd.com",
  "jd": "jd.com",
  "微博": "weibo.com",
  "weibo": "weibo.com",
  "抖音": "douyin.com",
  "douyin": "douyin.com"
};

/**
 * Build search URL with keywords
 */
function buildSearchUrl(domain, keywords) {
  const config = SITE_CONFIG[domain];
  if (!config || !config.search_url) return null;

  const query = encodeURIComponent(keywords.join(" "));
  return config.search_url.replace("{query}", query);
}

/**
 * Get browse URL for a domain
 */
function getBrowseUrl(domain) {
  const config = SITE_CONFIG[domain];
  if (!config || !config.browse_url) return `https://www.${domain}/`;
  return config.browse_url;
}

/**
 * Get site configuration by URL
 */
function getSiteConfig(url) {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return SITE_CONFIG[domain] || null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  SITE_CONFIG,
  COMMON_SITES,
  buildSearchUrl,
  getBrowseUrl,
  getSiteConfig
};
