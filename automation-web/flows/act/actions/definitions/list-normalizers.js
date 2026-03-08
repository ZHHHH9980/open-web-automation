"use strict";

const { stripTags, summarizeText, extractContentText } = require("./normalizers/text-utils");
const { normalizeListItem: normalizeSiteListItem, isUsefulDisplayItem: isUsefulSiteDisplayItem } = require("../../site-adapters");

function isUsefulGenericDisplayItem(item) {
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
    publish_time: 0,
    raw_type: String(item?.type || source?.type || "").trim(),
  };
}

function normalizeListItem(state, item) {
  return normalizeSiteListItem(state, item, normalizeGenericItem);
}

function isUsefulDisplayItem(state, item) {
  return isUsefulSiteDisplayItem(state, item, isUsefulGenericDisplayItem);
}

function normalizeListItems(state, items) {
  return items
    .map((item) => normalizeListItem(state, item))
    .filter((item) => isUsefulDisplayItem(state, item));
}

module.exports = {
  normalizeListItem,
  normalizeListItems,
  isUsefulDisplayItem,
};
