"use strict";

const { getValueByPath, fillTemplate } = require("../../act/actions/definitions/helpers/common");
const { decodeEntities } = require("../../act/actions/definitions/normalizers/text-utils");

const CURRENT_USER_PLACEHOLDERS = {
  current_user_url_token: "url_token",
  current_user_profile_url: "profile_url",
  current_user_following_url: "following_url",
  current_user_followers_url: "followers_url",
  current_user_answers_url: "answers_url",
  current_user_posts_url: "posts_url",
};

function matches(url) {
  return /zhihu\.com/i.test(String(url || ""));
}

function isSearchPageUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return /\/search\b/i.test(parsed.pathname) || Boolean(parsed.searchParams.get("q"));
  } catch (_err) {
    return false;
  }
}

function normalizeAuthorName(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function countAuthorMatches(entries, action = {}) {
  const expected = normalizeAuthorName(action?.author || "");
  if (!expected) return 0;
  const exact = Boolean(action?.exact_author);
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const actual = normalizeAuthorName(entry?.display?.author || "");
    if (!actual) return false;
    return exact ? actual === expected : actual.includes(expected);
  }).length;
}

function cleanArtifactNoise(value) {
  return String(value || "")
    .replace(/<\s*img\b[^>]*>/gi, "\n")
    .replace(/<\s*figure\b[^>]*>/gi, "\n")
    .replace(/<\s*\/\s*figure\s*>/gi, "\n")
    .replace(/"\s*data-caption=[\s\S]*?(?:\/?>)/gi, "\n")
    .replace(/\bdata-[a-z0-9_-]+="[^"]*"/gi, " ")
    .replace(/\bclass="origin_image[^\"]*"/gi, " ")
    .replace(/\bwidth="\d+"/gi, " ")
    .replace(/\bheight="\d+"/gi, " ")
    .replace(/https?:\/\/(?:pic\d?|picx)\.zhimg\.com\/[^"]+/gi, " ")
    .replace(/\[图片\s*:?\s*\]/g, " ");
}

function stripTags(value) {
  return decodeEntities(cleanArtifactNoise(String(value || "")))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preserveParagraphText(value) {
  return decodeEntities(cleanArtifactNoise(String(value || "")))
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*img[^>]*alt=["']([^"']+)["'][^>]*>/gi, "\n[图片: $1]\n")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<(p|div|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function summarizeText(value, limit = 180) {
  const normalized = stripTags(value);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function extractContentText(value, limit = 1200) {
  const normalized = preserveParagraphText(value);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  if (timestamp < 1e11) return timestamp * 1000;
  return timestamp;
}

function firstValidTimestamp(candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeTimestamp(candidate);
    if (normalized > 0) return normalized;
  }
  return 0;
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
  if (raw.startsWith("/")) return `https://www.zhihu.com${raw}`;

  try {
    const parsed = new URL(raw);
    if (/api\.zhihu\.com$/i.test(parsed.hostname)) {
      const questionMatch = parsed.pathname.match(/^\/questions\/(\d+)/);
      if (questionMatch) return `https://www.zhihu.com/question/${questionMatch[1]}`;
      const answerMatch = parsed.pathname.match(/^\/answers\/(\d+)/);
      if (answerMatch) return `https://www.zhihu.com/answer/${answerMatch[1]}`;
      const articleMatch = parsed.pathname.match(/^\/articles\/(\d+)/);
      if (articleMatch) return `https://zhuanlan.zhihu.com/p/${articleMatch[1]}`;
      const peopleMatch = parsed.pathname.match(/^\/people\/([^/]+)/);
      if (peopleMatch) return `https://www.zhihu.com/people/${peopleMatch[1]}`;
    }
    if (/^http:\/\/zhuanlan\.zhihu\.com\//i.test(raw)) {
      return raw.replace(/^http:/i, "https:");
    }
    return raw;
  } catch (_err) {
    return raw;
  }
}

function extractZhihuTimestamp(root, descriptionObject, firstAnswer, firstContentItem) {
  return firstValidTimestamp([
    firstAnswer?.updated_time,
    firstAnswer?.created_time,
    firstAnswer?.updated,
    firstAnswer?.created,
    root?.updated_time,
    root?.created_time,
    root?.updated,
    root?.created,
    descriptionObject?.updated_time,
    descriptionObject?.created_time,
    descriptionObject?.updated,
    descriptionObject?.created,
    firstContentItem?.updated_time,
    firstContentItem?.created_time,
    firstContentItem?.updated,
    firstContentItem?.created,
    root?.published_time,
    root?.publish_time,
    descriptionObject?.published_time,
    descriptionObject?.publish_time,
  ]);
}

function extractZhihuAuthorProfileUrl(root, descriptionObject, firstAnswer) {
  const token = String(
    firstAnswer?.author?.url_token
      || root?.author?.url_token
      || descriptionObject?.author?.url_token
      || ""
  ).trim();
  if (token) {
    return `https://www.zhihu.com/people/${token}`;
  }

  const rawUrl = firstAnswer?.author?.url || root?.author?.url || descriptionObject?.author?.url || "";
  return normalizeZhihuUrl(rawUrl);
}

function normalizeListItem(_state, item) {
  const root = item?.object || item?.target || item || {};
  const descriptionObject = root?.description?.object || {};
  const contentItems = Array.isArray(root?.content_items) ? root.content_items : [];
  const firstContentItem = contentItems[0] || {};
  const subContents = Array.isArray(firstContentItem?.sub_contents) ? firstContentItem.sub_contents : [];
  const firstAnswer = subContents
    .map((entry) => entry?.object)
    .find((entry) => entry && (entry.type === "answer" || entry.excerpt || entry.content))
    || (firstContentItem?.object?.type === "answer" ? firstContentItem.object : null)
    || (root?.type === "answer" ? root : null)
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
      || firstAnswer?.excerpt_new
      || firstAnswer?.content
      || descriptionObject?.description
      || root?.excerpt
      || root?.excerpt_new
      || root?.description
      || title
  );

  const questionId = String(firstAnswer?.question?.id || questionObject?.id || descriptionObject?.id || "").trim();
  const answerId = String(firstAnswer?.id || "").trim();
  const detailUrl = normalizeZhihuUrl(firstAnswer?.url || descriptionObject?.url || root?.url || "", questionId, answerId);
  const likes = Number(
    firstAnswer?.voteup_count
      ?? firstAnswer?.reaction?.statistics?.like_count
      ?? root?.voteup_count
      ?? root?.reaction?.statistics?.like_count
      ?? descriptionObject?.voteup_count
      ?? 0
  ) || 0;
  const publishTime = extractZhihuTimestamp(root, descriptionObject, firstAnswer, firstContentItem);
  const authorProfileUrl = extractZhihuAuthorProfileUrl(root, descriptionObject, firstAnswer);

  return {
    title,
    author,
    author_profile_url: authorProfileUrl,
    content_summary: summary,
    article_content: articleContent,
    detail_url: detailUrl,
    likes,
    publish_time: publishTime,
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

function resolveApiConfigOverride(state, apiKind, rawApiConfig) {
  if (apiKind !== "list") return null;

  try {
    const parsed = new URL(String(state?.url || ""));
    const match = parsed.pathname.match(/^\/people\/([^/]+)\/posts\/?$/i);
    if (!match) return null;
    const urlToken = String(match[1] || "").trim();
    if (!urlToken) return null;

    return {
      ...rawApiConfig,
      endpoint: `https://www.zhihu.com/api/v4/members/${urlToken}/articles`,
      items_path: "data",
      item_url_path: "url",
      author_url_token: urlToken,
      source: "zhihu_author_posts",
    };
  } catch (_err) {
    return null;
  }
}

function canCollectListEntries(action, state) {
  const currentUrl = String(state?.url || "");
  if (!currentUrl) return false;

  if (Boolean(action?.author) && isSearchPageUrl(currentUrl)) {
    return true;
  }

  return false;
}

function explainListCollectionSupport(action, state) {
  if (canCollectListEntries(action, state)) {
    return "Zhihu search results may load the list API lazily after scroll, so scrape_list can proceed before the first matching response is captured";
  }
  return "";
}

async function collectListEntries(page, state, context = {}, action = {}, helpers = {}) {
  const { defaultCollector, maxItems, resolveConfiguredApi, getLiveApiResponses, buildStructuredEntries } = helpers;
  if (typeof defaultCollector !== "function"
    || typeof resolveConfiguredApi !== "function"
    || typeof getLiveApiResponses !== "function"
    || typeof buildStructuredEntries !== "function") {
    return typeof defaultCollector === "function"
      ? defaultCollector()
      : { entries: [], endpoint: "", itemsPath: "" };
  }

  const currentUrl = String(page?.url?.() || state?.url || "");
  const { apiConfig, endpoint } = resolveConfiguredApi({ ...state, url: currentUrl }, "list");
  const itemsPath = apiConfig?.items_path || "data.items";
  const isBrowseFeed = /\/api\/v3\/feed\/topstory\/recommend/i.test(String(endpoint || ""));
  const needsAuthorSearchCollection = Boolean(action?.author)
    && isSearchPageUrl(currentUrl)
    && /\/api\/v4\/search_v3/i.test(String(endpoint || ""));

  if (!isBrowseFeed && !needsAuthorSearchCollection) {
    return defaultCollector();
  }

  let apiResponses = getLiveApiResponses(state, context);
  let entries = buildStructuredEntries({ ...state, url: currentUrl }, endpoint, itemsPath, apiResponses, maxItems);

  const hasEnoughEntries = () => {
    if (needsAuthorSearchCollection) {
      return countAuthorMatches(entries, action) > 0;
    }
    return entries.length >= maxItems;
  };

  if (hasEnoughEntries()) {
    return { entries, endpoint, itemsPath };
  }

  const maxAttempts = needsAuthorSearchCollection ? 5 : 3;
  for (let attempt = 0; attempt < maxAttempts && !hasEnoughEntries(); attempt += 1) {
    await page.mouse.wheel(0, 2600 + attempt * 500);
    await page.waitForTimeout(1800 + attempt * 450);
    apiResponses = getLiveApiResponses(state, context);
    entries = buildStructuredEntries({ ...state, url: currentUrl }, endpoint, itemsPath, apiResponses, maxItems);
  }

  return { entries, endpoint, itemsPath };
}

function getApiResponses(state, context = {}) {
  const collectorData = context.currentApiCollector?.getData?.();
  if (Array.isArray(collectorData) && collectorData.length > 0) {
    return collectorData;
  }
  return state?.api_responses || [];
}

function resolveCurrentUserProfile(state, context = {}) {
  const apiResponses = getApiResponses(state, context);
  const meResponse = [...apiResponses]
    .reverse()
    .find((item) => String(item.url || "").startsWith("https://www.zhihu.com/api/v4/me"));

  const data = meResponse?.data || {};
  const urlToken = String(data.url_token || "").trim();
  if (!urlToken) {
    return { ok: false, error: "current Zhihu user profile was not captured from api/v4/me" };
  }

  return {
    ok: true,
    url_token: urlToken,
    profile_url: `https://www.zhihu.com/people/${urlToken}`,
    following_url: `https://www.zhihu.com/people/${urlToken}/following`,
    followers_url: `https://www.zhihu.com/people/${urlToken}/followers`,
    answers_url: `https://www.zhihu.com/people/${urlToken}/answers`,
    posts_url: `https://www.zhihu.com/people/${urlToken}/posts`,
  };
}

function resolveCurrentUserPlaceholder(rawUrl, state, context = {}) {
  const matches = Array.from(String(rawUrl || "").matchAll(/\{\{([^}]+)\}\}/g));
  if (matches.length === 0) return { ok: true, url: String(rawUrl || "") };

  const needsCurrentUser = matches.some((match) => Object.prototype.hasOwnProperty.call(CURRENT_USER_PLACEHOLDERS, match[1]));
  if (!needsCurrentUser) return { ok: true, url: String(rawUrl || "") };

  const profile = resolveCurrentUserProfile(state, context);
  if (!profile.ok) return { ok: false, error: profile.error };

  let resolved = String(rawUrl || "");
  for (const match of matches) {
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(CURRENT_USER_PLACEHOLDERS, key)) continue;
    resolved = resolved.replace(match[0], String(profile[CURRENT_USER_PLACEHOLDERS[key]] || ""));
  }
  return { ok: true, url: resolved };
}

function buildAuthorDerivedUrl(displayItem, suffix = "") {
  const profileUrl = String(displayItem?.author_profile_url || "").trim().replace(/\/$/, "");
  if (!profileUrl) return "";
  return suffix ? `${profileUrl}${suffix}` : profileUrl;
}

function resolveCapturedListPlaceholder(placeholder, context = {}, state, resolveConfiguredApi) {
  const match = String(placeholder || "").match(/^item_(\d+)_(url|author_profile_url|author_posts_url|author_answers_url)$/);
  if (!match) return { ok: false, error: "unsupported placeholder" };

  const index = Number(match[1]) - 1;
  const rawItems = context.lastListCapture?.items;
  const displayItems = context.lastListCapture?.display_items;
  if (!Array.isArray(rawItems) || !rawItems[index]) {
    return { ok: false, error: `captured list item ${index + 1} is unavailable` };
  }

  const rawItem = rawItems[index];
  const displayItem = Array.isArray(displayItems) ? displayItems[index] || {} : {};
  const kind = match[2];

  if (kind === "author_profile_url") {
    const profileUrl = buildAuthorDerivedUrl(displayItem);
    return profileUrl ? { ok: true, url: profileUrl } : { ok: false, error: `captured list item ${index + 1} does not include author profile url` };
  }
  if (kind === "author_posts_url") {
    const postsUrl = buildAuthorDerivedUrl(displayItem, "/posts");
    return postsUrl ? { ok: true, url: postsUrl } : { ok: false, error: `captured list item ${index + 1} does not include author posts url` };
  }
  if (kind === "author_answers_url") {
    const answersUrl = buildAuthorDerivedUrl(displayItem, "/answers");
    return answersUrl ? { ok: true, url: answersUrl } : { ok: false, error: `captured list item ${index + 1} does not include author answers url` };
  }

  const listConfig = resolveConfiguredApi(state, "list").apiConfig || {};
  const directUrl = listConfig.item_url_path ? getValueByPath(rawItem, listConfig.item_url_path) : rawItem.url;
  if (directUrl) {
    const normalizedUrl = String(directUrl);
    return { ok: true, url: normalizedUrl.startsWith("http") ? normalizedUrl : `https://www.zhihu.com${normalizedUrl}` };
  }
  if (listConfig.item_url_template) {
    const templatedUrl = fillTemplate(listConfig.item_url_template, rawItem);
    if (templatedUrl && !templatedUrl.includes("{}")) return { ok: true, url: templatedUrl };
  }
  return { ok: false, error: `site-config could not derive URL for item ${index + 1}` };
}

function resolveCapturedItemUrl(actionUrl, context = {}, state, resolveConfiguredApi) {
  const placeholderResolved = resolveCurrentUserPlaceholder(actionUrl, state, context);
  if (!placeholderResolved.ok) return placeholderResolved;

  const rawUrl = String(placeholderResolved.url || "").trim();
  const matches = Array.from(rawUrl.matchAll(/\{\{([^}]+)\}\}/g));
  if (matches.length === 0) return { ok: true, url: rawUrl };

  let resolved = rawUrl;
  for (const match of matches) {
    const itemResolved = resolveCapturedListPlaceholder(match[1], context, state, resolveConfiguredApi);
    if (!itemResolved.ok) return itemResolved;
    resolved = resolved.replace(match[0], itemResolved.url);
  }
  return { ok: true, url: resolved };
}

module.exports = {
  name: "zhihu",
  matches,
  normalizeListItem,
  isUsefulDisplayItem,
  resolveApiConfigOverride,
  canCollectListEntries,
  explainListCollectionSupport,
  collectListEntries,
  resolveCurrentUserProfile,
  resolveCurrentUserPlaceholder,
  resolveCapturedItemUrl,
  __internal: {
    cleanArtifactNoise,
    normalizeZhihuUrl,
    normalizeTimestamp,
    firstValidTimestamp,
    extractZhihuTimestamp,
    isSearchPageUrl,
    normalizeAuthorName,
    countAuthorMatches,
    canCollectListEntries,
    explainListCollectionSupport,
    buildAuthorDerivedUrl,
    resolveCapturedListPlaceholder,
  },
};
