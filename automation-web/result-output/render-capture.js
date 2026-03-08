"use strict";

const {
  normalizeInlineText,
  formatRichText,
  truncateText,
  formatTimestamp,
} = require("./text-format");

function compactInteraction(info = {}) {
  const parts = [];
  const likes = Number(info.liked_count);
  const comments = Number(info.comment_count);
  const collected = Number(info.collected_count);
  const shares = Number(info.share_count);

  if (likes > 0) parts.push(`${likes}赞`);
  if (comments > 0) parts.push(`${comments}评`);
  if (collected > 0) parts.push(`${collected}藏`);
  if (shares > 0) parts.push(`${shares}分享`);

  return parts.join("｜");
}

function collectDetailLinks(detail = {}) {
  const links = [];
  const detailUrl = normalizeInlineText(detail.detail_url || detail.share_info?.link || "");
  const videoStreams = detail.video?.media?.stream || {};
  const videoUrl = normalizeInlineText(
    videoStreams.h264?.[0]?.master_url
      || videoStreams.h265?.[0]?.master_url
      || ""
  );
  const imageUrl = normalizeInlineText(
    detail.image_list?.[0]?.url_default
      || detail.image_list?.[0]?.url_pre
      || detail.image_list?.[0]?.info_list?.[0]?.url
      || ""
  );

  [detailUrl, videoUrl, imageUrl].forEach((link) => {
    if (link && !links.includes(link)) {
      links.push(link);
    }
  });

  return links;
}

function renderDetailItem(detail, itemIndex) {
  if (!detail || typeof detail !== "object") {
    return "";
  }

  const title = normalizeInlineText(detail.title || `结果 ${itemIndex}`);
  const author = normalizeInlineText(detail.user?.nickname || detail.author || "未知作者");
  const summary = formatRichText(detail.desc || detail.content_summary || "");
  const interaction = compactInteraction(detail.interact_info);
  const publishTime = formatTimestamp(detail.time || detail.last_update_time);
  const noteType = normalizeInlineText(detail.type || "");
  const location = normalizeInlineText(detail.ip_location || "");
  const links = collectDetailLinks(detail);

  const lines = [`## ${itemIndex}. ${title}`, "", `- 作者：${author}`];

  if (noteType) {
    lines.push(`- 类型：${noteType}`);
  }

  if (publishTime) {
    lines.push(`- 时间：${publishTime}`);
  }

  if (location) {
    lines.push(`- 属地：${location}`);
  }

  if (interaction) {
    lines.push(`- 互动：${interaction}`);
  }

  if (summary) {
    lines.push("", "### 摘要", "", summary);
  }

  if (links.length > 0) {
    lines.push("", "### 链接", "");
    links.forEach((link) => lines.push(`- ${link}`));
  }

  return lines.join("\n");
}

function renderListItem(item, itemIndex) {
  if (!item || typeof item !== "object") {
    return "";
  }

  const title = normalizeInlineText(item.title || `结果 ${itemIndex}`);
  const author = normalizeInlineText(item.author || "未知作者");
  const summary = formatRichText(item.content_summary || "");
  const articleContent = formatRichText(item.article_content || "");
  const detailUrl = normalizeInlineText(item.detail_url || "");
  const likes = Number(item.likes) || 0;
  const publishTime = formatTimestamp(item.publish_time);

  const lines = [`## ${itemIndex}. ${title}`, "", `- 作者：${author}`];

  if (publishTime) {
    lines.push(`- 时间：${publishTime}`);
  }

  if (likes > 0) {
    lines.push(`- 点赞：${likes}`);
  }

  if (detailUrl) {
    lines.push(`- 链接：${detailUrl}`);
  }

  if (summary) {
    lines.push("", "### 摘要", "", summary);
  }

  if (articleContent && normalizeInlineText(articleContent) !== normalizeInlineText(summary)) {
    lines.push("", "### 内容", "", articleContent);
  }

  return lines.join("\n");
}

function renderCaptureEntry(entry, itemIndex) {
  const parsed = entry?.parsed || {};

  if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    return parsed.items
      .map((item, offset) => renderListItem(item, itemIndex + offset))
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

  if (parsed.detail && typeof parsed.detail === "object") {
    return renderDetailItem(parsed.detail, itemIndex);
  }

  const fallback = truncateText(entry?.label || entry?.content || "");
  if (!fallback) {
    return "";
  }

  return [`## ${itemIndex}. ${fallback}`].join("\n");
}

function renderStructuredItems(entries) {
  const blocks = [];
  let itemIndex = 1;

  for (const entry of entries) {
    const block = renderCaptureEntry(entry, itemIndex);
    if (!block) {
      continue;
    }

    blocks.push(block);
    itemIndex += Array.isArray(entry?.parsed?.items) ? entry.parsed.items.length : 1;
  }

  return blocks.join("\n\n---\n\n").trim();
}

module.exports = {
  compactInteraction,
  collectDetailLinks,
  renderDetailItem,
  renderListItem,
  renderCaptureEntry,
  renderStructuredItems,
};
