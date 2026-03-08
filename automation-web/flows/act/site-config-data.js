"use strict";

const SITE_CONFIG = {
  "xiaohongshu.com": {
    urls: {
      search: "https://www.xiaohongshu.com/search_result?keyword={query}&source=web_explore_feed",
      browse: "https://www.xiaohongshu.com/explore",
    },
    planning: {
      preferred_flow: "list_then_detail",
      detail_open_mode: "click_result_item",
      content_from_list: false,
      summary: "Search results are mainly for discovery. For content retrieval tasks, open the note detail page and use detail data when available.",
    },
    api: {
      list: {
        endpoint: "https://edith.xiaohongshu.com/api/sns/web/v1/search/notes",
        items_path: "data.items",
        item_url_template: "https://www.xiaohongshu.com/explore/{id}?xsec_token={xsec_token}",
      },
      detail: {
        endpoint: "https://edith.xiaohongshu.com/api/sns/web/v1/feed",
        detail_path: "data.items.0.note_card",
      },
    },
    selectors: {
      article_list: ".note-item",
      article_link: ".note-item a.title, section.note-item a.title, .search-result-container a.title",
      article_title: ".title",
      article_content: ".content",
      login_modal: ".login-modal",
      login_close_button: ".login-modal .close-btn",
    },
  },

  "zhihu.com": {
    urls: {
      search: "https://www.zhihu.com/search?q={query}",
      browse: "https://www.zhihu.com/",
    },
    planning: {
      preferred_flow: "list_only",
      detail_open_mode: "none",
      content_from_list: true,
      summary: "Search results usually contain enough title, excerpt, and URL to answer article discovery and content-summary tasks without opening detail pages.",
    },
    api: {
      list: {
        endpoint: "https://www.zhihu.com/api/v4/search_v3",
        items_path: "data",
        item_url_path: "object.url",
        browse_endpoint: "https://www.zhihu.com/api/v3/feed/topstory/recommend",
        browse_items_path: "data",
        browse_item_url_path: "target.url",
      },
    },
    selectors: {
      article_list: ".List-item",
      article_title: ".ContentItem-title",
      article_content: ".RichContent-inner",
      login_modal: ".Modal-wrapper",
      login_close_button: ".Modal-closeButton",
    },
  },

  "bilibili.com": {
    urls: {
      search: "https://search.bilibili.com/all?keyword={query}",
      browse: "https://www.bilibili.com/",
    },
    selectors: {
      video_list: ".video-item",
      video_title: ".title",
      video_desc: ".desc",
      login_modal: ".bili-mini-login",
      login_close_button: ".bili-mini-close",
    },
  },

  "goofish.com": {
    urls: {
      search: "https://www.goofish.com/search?q={query}",
      browse: "https://www.goofish.com/",
    },
    selectors: {
      item_list: ".item",
      item_title: ".title",
      item_price: ".price",
      login_modal: ".login-modal",
      login_close_button: ".close",
    },
  },

  "taobao.com": {
    urls: {
      search: "https://s.taobao.com/search?q={query}",
      browse: "https://www.taobao.com/",
    },
    selectors: {
      item_list: ".item",
      item_title: ".title",
      item_price: ".price",
    },
  },

  "jd.com": {
    urls: {
      search: "https://search.jd.com/Search?keyword={query}",
      browse: "https://www.jd.com/",
    },
    selectors: {
      item_list: ".gl-item",
      item_title: ".p-name",
      item_price: ".p-price",
    },
  },

  "weibo.com": {
    urls: {
      search: "https://s.weibo.com/weibo?q={query}",
      browse: "https://weibo.com/",
    },
    selectors: {
      post_list: ".card-wrap",
      post_content: ".txt",
      login_modal: ".gn_login_layer",
      login_close_button: ".W_close",
    },
  },

  "douyin.com": {
    urls: {
      search: "https://www.douyin.com/search/{query}",
      browse: "https://www.douyin.com/",
    },
    selectors: {
      video_list: ".video-item",
      video_title: ".title",
    },
  },
};

const COMMON_SITES = {
  "小红书": "xiaohongshu.com",
  xhs: "xiaohongshu.com",
  rednote: "xiaohongshu.com",
  "知乎": "zhihu.com",
  zhihu: "zhihu.com",
  "b站": "bilibili.com",
  bilibili: "bilibili.com",
  "哔哩": "bilibili.com",
  "闲鱼": "goofish.com",
  xianyu: "goofish.com",
  goofish: "goofish.com",
  "淘宝": "taobao.com",
  taobao: "taobao.com",
  "京东": "jd.com",
  jd: "jd.com",
  "微博": "weibo.com",
  weibo: "weibo.com",
  "抖音": "douyin.com",
  douyin: "douyin.com",
};

module.exports = {
  SITE_CONFIG,
  COMMON_SITES,
};
