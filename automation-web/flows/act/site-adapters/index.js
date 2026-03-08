"use strict";

const { getSiteModule, zhihu, xiaohongshu } = require("../../site-modules");

function normalizeListItem(state, item, fallback) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.normalizeListItem === "function") {
    return siteModule.normalizeListItem(state, item);
  }
  return fallback(item);
}

function isUsefulDisplayItem(state, item, fallback) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.isUsefulDisplayItem === "function") {
    return siteModule.isUsefulDisplayItem(item);
  }
  return fallback(item);
}

function resolveApiConfigOverride(state, apiKind, rawApiConfig) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.resolveApiConfigOverride === "function") {
    return siteModule.resolveApiConfigOverride(state, apiKind, rawApiConfig);
  }
  return null;
}

function resolveCurrentUserProfile(state, context = {}) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.resolveCurrentUserProfile === "function") {
    return siteModule.resolveCurrentUserProfile(state, context);
  }
  return { ok: false, error: `current site does not support current-user profile resolution: ${state?.url || "unknown"}` };
}

function resolveCurrentUserPlaceholder(rawUrl, state, context = {}) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.resolveCurrentUserPlaceholder === "function") {
    return siteModule.resolveCurrentUserPlaceholder(rawUrl, state, context);
  }
  return { ok: true, url: String(rawUrl || "") };
}

function resolveCapturedItemUrl(actionUrl, context = {}, state, resolveConfiguredApi) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.resolveCapturedItemUrl === "function") {
    return siteModule.resolveCapturedItemUrl(actionUrl, context, state, resolveConfiguredApi);
  }
  return { ok: true, url: String(actionUrl || "") };
}

function canHandleClick(action, state) {
  const siteModule = getSiteModule(state?.url || "");
  return Boolean(siteModule && typeof siteModule.canHandleClick === "function" && siteModule.canHandleClick(action, state));
}

function explainClickSupport(action, state) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.explainClickSupport === "function") {
    return siteModule.explainClickSupport(action, state);
  }
  return `click is not supported on current page: ${state?.url || "unknown"}`;
}

async function executePlatformClick(page, action, state, context = {}) {
  const siteModule = getSiteModule(state?.url || "");
  if (siteModule && typeof siteModule.executeClick === "function") {
    return siteModule.executeClick(page, action, state, context);
  }
  return null;
}

async function collectListEntries(page, state, context = {}, action = {}, helpers = {}) {
  const siteModule = getSiteModule(state?.url || page?.url?.() || "");
  if (siteModule && typeof siteModule.collectListEntries === "function") {
    return siteModule.collectListEntries(page, state, context, action, helpers);
  }
  if (typeof helpers.defaultCollector === "function") {
    return helpers.defaultCollector();
  }
  return { entries: [], endpoint: "", itemsPath: "" };
}

module.exports = {
  getSiteModule,
  normalizeListItem,
  isUsefulDisplayItem,
  resolveApiConfigOverride,
  resolveCurrentUserProfile,
  resolveCurrentUserPlaceholder,
  resolveCapturedItemUrl,
  canHandleClick,
  explainClickSupport,
  executePlatformClick,
  collectListEntries,
  zhihu,
  xiaohongshu,
};
