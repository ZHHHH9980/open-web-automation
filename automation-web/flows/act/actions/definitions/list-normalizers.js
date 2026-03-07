"use strict";

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeText(value, limit = 180) {
  const normalized = stripTags(value);
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function extractContentText(value, limit = 1200) {
  const normalized = stripTags(value);
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function normalizeZhihuUrl(url, questionId = "", answerId = "") {
  if (questionId && answerId) {
    return `https://www.zhihu.com/question/${questionId}/answer/${answerId}`;
  }
  if (questionId) {
    return `https://www.zhihu.com/question/${questionId}`;
  }

  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) {
    return `https://www.zhihu.com${raw}`;
  }

  try {
    const parsed = new URL(raw);
    if (/api\.zhihu\.com$/i.test(parsed.hostname)) {
      const questionMatch = parsed.pathname.match(/^\/questions\/(\d+)/);
      if (questionMatch) {
        return `https://www.zhihu.com/question/${questionMatch[1]}`;
      }
      const answerMatch = parsed.pathname.match(/^\/answers\/(\d+)/);
      if (answerMatch) {
        return `https://www.zhihu.com/answer/${answerMatch[1]}`;
      }
    }
    return raw;
  } catch (_err) {
    return raw;
  }
}

function normalizeZhihuItem(item) {
  const root = item?.object || item || {};
  const descriptionObject = root?.description?.object || {};
  const contentItems = Array.isArray(root?.content_items) ? root.content_items : [];
  const firstContentItem = contentItems[0] || {};
  const subContents = Array.isArray(firstContentItem?.sub_contents) ? firstContentItem.sub_contents : [];
  const firstAnswer = subContents
    .map((entry) => entry?.object)
    .find((entry) => entry && (entry.type === "answer" || entry.excerpt || entry.content))
    || (firstContentItem?.object?.type === "answer" ? firstContentItem.object : null)
    || null;

  const questionObject = firstAnswer?.question
    || (descriptionObject?.type === "question" ? descriptionObject : null)
    || root?.question
    || null;

  const title = stripTags(
    descriptionObject?.title
      || questionObject?.title
      || questionObject?.name
      || root?.title
      || firstContentItem?.object?.title
      || item?.title
  );

  const author = stripTags(
    firstAnswer?.author?.name
      || root?.author?.name
      || descriptionObject?.author?.name
      || "未知作者"
  );

  const articleContent = extractContentText(
    firstAnswer?.content
      || firstAnswer?.excerpt
      || descriptionObject?.description
      || root?.content
      || root?.excerpt
      || root?.description
      || title,
    1500
  );

  const summary = summarizeText(
    firstAnswer?.excerpt
      || firstAnswer?.content
      || descriptionObject?.description
      || root?.excerpt
      || root?.description
      || title
  );

  const questionId = String(firstAnswer?.question?.id || questionObject?.id || descriptionObject?.id || "").trim();
  const answerId = String(firstAnswer?.id || "").trim();
  const detailUrl = normalizeZhihuUrl(firstAnswer?.url || descriptionObject?.url || root?.url || "", questionId, answerId);
  const likes = Number(firstAnswer?.voteup_count ?? root?.voteup_count ?? descriptionObject?.voteup_count ?? 0) || 0;

  return {
    title,
    author,
    content_summary: summary,
    article_content: articleContent,
    detail_url: detailUrl,
    likes,
    raw_type: String(item?.type || root?.type || "").trim(),
  };
}

function isUsefulDisplayItem(item) {
  if (!item) return false;

  const title = String(item.title || "").trim();
  const summary = String(item.content_summary || "").trim();
  const detailUrl = String(item.detail_url || "").trim();

  if (!title && !summary) return false;
  if (/api\.zhihu\.com\/people\//i.test(detailUrl)) return false;

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

function normalizeListItem(state, item) {
  const url = String(state?.url || "");
  if (/zhihu\.com/i.test(url)) {
    return normalizeZhihuItem(item);
  }

  return normalizeGenericItem(item);
}

function normalizeListItems(state, items) {
  return items
    .map((item) => normalizeListItem(state, item))
    .filter(isUsefulDisplayItem);
}

module.exports = {
  normalizeListItem,
  normalizeListItems,
  isUsefulDisplayItem,
};
