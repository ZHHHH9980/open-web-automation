#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { resolveConfiguredApi } = require("../flows/act/actions/definitions/helpers");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("uses search endpoint on Zhihu search pages", () => {
  const resolved = resolveConfiguredApi({ url: "https://www.zhihu.com/search?type=content&q=openclaw" }, "list");
  assert.equal(resolved.endpoint, "https://www.zhihu.com/api/v4/search_v3");
  assert.equal(resolved.apiConfig.items_path, "data");
});

test("uses browse endpoint on Zhihu home page", () => {
  const resolved = resolveConfiguredApi({ url: "https://www.zhihu.com/" }, "list");
  assert.equal(resolved.endpoint, "https://www.zhihu.com/api/v3/feed/topstory/recommend");
  assert.equal(resolved.apiConfig.items_path, "data");
  assert.equal(resolved.apiConfig.item_url_path, "target.url");
});
