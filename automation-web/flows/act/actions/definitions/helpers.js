"use strict";

const { getSiteConfig } = require("../../site-config");

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function resolveSelector(decision, state) {
  if (decision.selector) return decision.selector;
  if (!decision.target_id) return "";
  const hit = (state?.candidates || []).find((x) => Number(x.id) === Number(decision.target_id));
  return hit ? hit.selector : "";
}

function hasCandidateTarget(decision, state) {
  if (!decision.target_id) return false;
  return (state?.candidates || []).some((candidate) => Number(candidate.id) === Number(decision.target_id));
}

function getValueByPath(value, path) {
  if (!path) return value;

  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => {
      if (current == null) return undefined;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        return current[Number(key)];
      }
      return current[key];
    }, value);
}

function fillTemplate(template, data) {
  return String(template).replace(/\{([^}]+)\}/g, (_match, key) => {
    const resolved = getValueByPath(data, key);
    return resolved == null ? "" : String(resolved);
  });
}

function resolveConfiguredApi(state, apiKind) {
  const siteConfig = getSiteConfig(state?.url || "");
  const rawApiConfig = siteConfig?.api?.[apiKind] || null;

  if (!rawApiConfig) {
    return { siteConfig, apiConfig: null, endpoint: "" };
  }

  if (typeof rawApiConfig === "string") {
    return {
      siteConfig,
      apiConfig: { endpoint: rawApiConfig },
      endpoint: rawApiConfig,
    };
  }

  let resolvedConfig = { ...rawApiConfig };

  try {
    const current = new URL(String(state?.url || ""));
    const isSearchPage = /\/search\b/.test(current.pathname) || Boolean(current.searchParams.get("q"));

    if (!isSearchPage && rawApiConfig.browse_endpoint) {
      resolvedConfig = {
        ...rawApiConfig,
        endpoint: rawApiConfig.browse_endpoint,
        items_path: rawApiConfig.browse_items_path || rawApiConfig.items_path,
        item_url_path: rawApiConfig.browse_item_url_path || rawApiConfig.item_url_path,
      };
    }
  } catch (_err) {
    // ignore URL parse issues and keep the default endpoint
  }

  return {
    siteConfig,
    apiConfig: resolvedConfig,
    endpoint: resolvedConfig?.endpoint || "",
  };
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
  const placeholders = {
    current_user_url_token: "url_token",
    current_user_profile_url: "profile_url",
    current_user_following_url: "following_url",
    current_user_followers_url: "followers_url",
    current_user_answers_url: "answers_url",
    current_user_posts_url: "posts_url",
  };

  const matches = Array.from(String(rawUrl || "").matchAll(/\{\{([^}]+)\}\}/g));
  if (matches.length === 0) {
    return { ok: true, url: String(rawUrl || "") };
  }

  const needsCurrentUser = matches.some((match) => Object.prototype.hasOwnProperty.call(placeholders, match[1]));
  if (!needsCurrentUser) {
    return { ok: true, url: String(rawUrl || "") };
  }

  const profile = resolveCurrentUserProfile(state, context);
  if (!profile.ok) {
    return { ok: false, error: profile.error };
  }

  let resolved = String(rawUrl || "");
  for (const match of matches) {
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(placeholders, key)) continue;
    resolved = resolved.replace(match[0], String(profile[placeholders[key]] || ""));
  }

  return { ok: true, url: resolved };
}

function resolveCapturedItemUrl(actionUrl, context = {}, state) {
  const placeholderResolved = resolveCurrentUserPlaceholder(actionUrl, state, context);
  if (!placeholderResolved.ok) {
    return placeholderResolved;
  }

  const rawUrl = String(placeholderResolved.url || "").trim();
  const match = rawUrl.match(/^\{\{item_(\d+)_url\}\}$/);
  if (!match) {
    return { ok: true, url: rawUrl };
  }

  const index = Number(match[1]) - 1;
  const listData = context.lastListCapture?.items;
  if (!Array.isArray(listData) || !listData[index]) {
    return { ok: false, error: `captured list item ${index + 1} is unavailable` };
  }

  const item = listData[index];
  const listConfig = resolveConfiguredApi(state, "list").apiConfig || {};

  const directUrl = listConfig.item_url_path ? getValueByPath(item, listConfig.item_url_path) : item.url;
  if (directUrl) {
    const normalizedUrl = String(directUrl);
    return {
      ok: true,
      url: normalizedUrl.startsWith("http") ? normalizedUrl : `https://www.zhihu.com${normalizedUrl}`,
    };
  }

  if (listConfig.item_url_template) {
    const templatedUrl = fillTemplate(listConfig.item_url_template, item);
    if (templatedUrl && !templatedUrl.includes("{}")) {
      return { ok: true, url: templatedUrl };
    }
  }

  return { ok: false, error: `site-config could not derive URL for item ${index + 1}` };
}

function findConfiguredApiResponse(state, apiKind, options = {}) {
  const { siteConfig, apiConfig, endpoint } = resolveConfiguredApi(state, apiKind);

  if (!endpoint) {
    return { ok: false, error: `current site does not define api.${apiKind}` };
  }

  const apiResponses = state?.api_responses || [];
  if (apiResponses.length === 0) {
    return { ok: false, error: `api.${apiKind} was configured but no API responses were captured` };
  }

  const minTimestamp = Number.isFinite(Number(options.minTimestamp)) ? Number(options.minTimestamp) : 0;
  const response = [...apiResponses]
    .reverse()
    .find((item) => String(item.url || "").startsWith(endpoint) && Number(item.timestamp || 0) >= minTimestamp);
  if (!response) {
    if (minTimestamp > 0) {
      return { ok: false, error: `configured api.${apiKind} endpoint was not captured after ${minTimestamp}: ${endpoint}` };
    }
    return { ok: false, error: `configured api.${apiKind} endpoint was not captured: ${endpoint}` };
  }

  return {
    ok: true,
    endpoint,
    apiConfig,
    response,
    siteConfig,
  };
}

module.exports = {
  toInt,
  resolveSelector,
  hasCandidateTarget,
  getValueByPath,
  getApiResponses,
  resolveConfiguredApi,
  resolveCurrentUserProfile,
  resolveCapturedItemUrl,
  findConfiguredApiResponse,
};
