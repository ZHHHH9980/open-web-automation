"use strict";

const { getSiteConfig } = require("../../../site-config");
const { resolveApiConfigOverride } = require("../../../site-adapters");

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
    const override = resolveApiConfigOverride(state, apiKind, rawApiConfig);

    if (override) {
      resolvedConfig = override;
    } else if (!isSearchPage && rawApiConfig.browse_endpoint) {
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
  resolveConfiguredApi,
  getApiResponses,
  findConfiguredApiResponse,
};
