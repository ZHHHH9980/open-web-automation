"use strict";

const { stripTags, summarizeText, extractContentText } = require("./text-utils");

function isUsefulDisplayItem(item) {
  if (!item) return false;

  const title = String(item.title || "").trim();
  const summary = String(item.content_summary || "").trim();

  if (!title && !summary) return false;

  return true;
}

function normalizeGenericItem(item) {
  const source = item?.object || item || {};
  const rawContent = source?.content || source?.excerpt || source?.description || "";
  return {
    title: stripTags(source?.title || source?.name || item?.title || ""),
    author: stripTags(source?.author?.name || source?.user?.nickname || item?.author || "未知作者"),
    content_summary: summarizeText(rawContent),
    article_content: extractContentText(rawContent),
    detail_url: String(source?.url || item?.url || "").trim(),
    likes: Number(source?.voteup_count ?? source?.liked_count ?? source?.like_count ?? 0) || 0,
    raw_type: String(item?.type || source?.type || "").trim(),
  };
}

module.exports = {
  isUsefulDisplayItem,
  normalizeGenericItem,
};
