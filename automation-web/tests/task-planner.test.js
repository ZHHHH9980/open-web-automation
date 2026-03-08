#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { validateActionDecision } = require("../flows/act/actions/registry");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("preserves custom scrape_list filters during validation", () => {
  const decision = validateActionDecision({
    action: "scrape_list",
    reason: "test",
    max_items: 1,
    author: "数字生命卡兹克",
    exact_author: true,
    latest_only: true,
    capture: false,
  });

  assert.equal(decision.author, "数字生命卡兹克");
  assert.equal(decision.exact_author, true);
  assert.equal(decision.latest_only, true);
  assert.equal(decision.capture, false);
  assert.equal(decision.max_items, 1);
});
