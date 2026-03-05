"use strict";

/**
 * 小红书平台配置
 *
 * 交互特点：
 * - 使用 modal 弹窗展示文章详情，而不是跳转新页面
 * - URL 会变化，但内容在弹窗中
 * - 需要点击关闭按钮返回搜索结果
 */
module.exports = {
  domain: "xiaohongshu.com",
  name: "小红书",
  aliases: ["xhs"],

  // 交互模式配置
  interaction: {
    // 文章详情展示方式
    detail_mode: "modal", // modal | page | spa

    // 导航方式
    navigation: {
      // 如何返回列表页
      back_method: "close_button", // close_button | back_action | history_back
      // 是否需要等待关闭动画
      close_animation: true,
      close_wait_ms: 500,
    },

    // 搜索行为
    search: {
      // 搜索后等待时间
      wait_after_search_ms: 1500,
      // 是否需要滚动加载结果
      lazy_load: true,
    },
  },

  // 选择器配置
  selectors: {
    // 搜索相关
    search_input: ".search-input",
    search_button: ".search-icon",

    // 弹窗相关
    modal_container: ".note-detail-modal",
    close_button: ".close",

    // 内容提取
    content_selector: ".note-content, .content",
    title_selector: ".title",

    // 列表相关
    article_list: ".note-item",
  },

  // Agent 提示信息
  agent_hints: {
    // 关键行为提示
    modal_navigation: "This site uses modal popups for article details. DO NOT use 'back' action. MUST use close_button selector to close modals.",
    content_extraction: "Content is inside modal. System will auto-use content_selector for extract action.",
    search_results: "Search results may need scrolling to load more items.",

    // 常见问题
    common_issues: [
      "If modal doesn't close, try clicking close_button again after waiting",
      "If content extraction is empty, the article might be a video with minimal text",
    ],
  },

  // 动作链条建议（给 Agent 参考，不强制）
  suggested_workflows: {
    // 提取多篇文章的建议流程
    extract_multiple_articles: [
      "1. Search for keyword",
      "2. Click article to open modal",
      "3. Extract content from modal",
      "4. Click close_button to close modal",
      "5. Repeat steps 2-4 for next article",
    ],
  },
};
