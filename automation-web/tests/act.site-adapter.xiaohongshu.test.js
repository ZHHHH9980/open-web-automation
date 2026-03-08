#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { xiaohongshu } = require("../flows/act/site-adapters");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("xiaohongshu adapter recognizes search result pages", () => {
  assert.equal(
    xiaohongshu.canHandleClick(
      { target_id: 1 },
      { url: "https://www.xiaohongshu.com/search_result?keyword=openclaw", api_responses: [] }
    ),
    true
  );
});
