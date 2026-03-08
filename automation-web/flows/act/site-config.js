"use strict";

const { SITE_CONFIG, COMMON_SITES } = require("./site-config-data");

function buildSearchUrl(domain, keywords) {
  const config = SITE_CONFIG[domain];
  const searchUrl = config?.urls?.search || config?.search_url;
  if (!searchUrl) return null;

  const query = encodeURIComponent(keywords.join(" "));
  return searchUrl.replace("{query}", query);
}

function getBrowseUrl(domain) {
  const config = SITE_CONFIG[domain];
  const browseUrl = config?.urls?.browse || config?.browse_url;
  if (!browseUrl) return `https://www.${domain}/`;
  return browseUrl;
}

function getSiteConfig(url) {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return SITE_CONFIG[domain] || null;
  } catch (_err) {
    return null;
  }
}

module.exports = {
  SITE_CONFIG,
  COMMON_SITES,
  buildSearchUrl,
  getBrowseUrl,
  getSiteConfig,
};
