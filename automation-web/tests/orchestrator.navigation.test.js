#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { __internal } = require("../flows/orchestrator");

const { shouldDeferInitialNavigation } = __internal;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const basePlan = (url) => [
  { action: "listen" },
  { action: "goto", url },
];

test("defers when initial URL exactly matches goto URL", () => {
  assert.equal(
    shouldDeferInitialNavigation(
      basePlan("https://www.zhihu.com/search?type=content&q=openclaw"),
      "https://www.zhihu.com/search?type=content&q=openclaw"
    ),
    true
  );
});

test("defers when initial URL is a less-specific version of goto URL", () => {
  assert.equal(
    shouldDeferInitialNavigation(
      basePlan("https://www.zhihu.com/search?type=content&q=openclaw"),
      "https://www.zhihu.com/search?q=openclaw"
    ),
    true
  );
});

test("does not defer when query differs", () => {
  assert.equal(
    shouldDeferInitialNavigation(
      basePlan("https://www.zhihu.com/search?type=content&q=openclaw"),
      "https://www.zhihu.com/search?q=other"
    ),
    false
  );
});
