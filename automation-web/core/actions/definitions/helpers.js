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

function resolveCapturedItemUrl(actionUrl, context = {}, state) {
  const rawUrl = String(actionUrl || "").trim();
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
  const siteConfig = getSiteConfig(state?.url || "");
  const listConfig = siteConfig?.api?.list || {};

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
  const siteConfig = getSiteConfig(state?.url || "");
  const apiConfig = siteConfig?.api?.[apiKind] || null;
  const endpoint = typeof apiConfig === "string" ? apiConfig : apiConfig?.endpoint || "";

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
  resolveCapturedItemUrl,
  findConfiguredApiResponse,
};
