#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { SITE_CONFIG, COMMON_SITES, buildSearchUrl, getBrowseUrl, getSiteConfig } = require("../flows/act/site-config");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("exports site config and common site aliases", () => {
  assert.equal(COMMON_SITES["知乎"], "zhihu.com");
  assert.equal(Boolean(SITE_CONFIG["xiaohongshu.com"]), true);
});

test("builds search and browse urls from config", () => {
  assert.equal(buildSearchUrl("zhihu.com", ["AI Agent"]), "https://www.zhihu.com/search?q=AI%20Agent");
  assert.equal(getBrowseUrl("zhihu.com"), "https://www.zhihu.com/");
});

test("resolves site config from url", () => {
  const config = getSiteConfig("https://www.zhihu.com/search?q=test");
  assert.equal(config?.urls?.browse, "https://www.zhihu.com/");
  assert.equal(getSiteConfig("not-a-url"), null);
});
