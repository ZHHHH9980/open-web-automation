#!/usr/bin/env node
"use strict";

const assert = require("assert");
const selectList = require("../flows/act/actions/definitions/select-list");

const { evaluateNumericExpression, resolveSelection } = selectList.__internal;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("evaluates arithmetic expressions with Chinese numerals", () => {
  assert.equal(evaluateNumericExpression("4 + 1 - 2"), 3);
  assert.equal(evaluateNumericExpression("十二 - 两"), 10);
});

test("selects the second newest item for 最新第二篇", () => {
  assert.deepEqual(resolveSelection("去知乎看看数字生命卡兹克最新第二篇文章", 5), [1]);
});

test("selects a range for 最新前两篇", () => {
  assert.deepEqual(resolveSelection("去知乎看看数字生命卡兹克最新两篇文章", 5), [0, 1]);
});

test("rejects invalid arithmetic ordinals", () => {
  assert.throws(
    () => resolveSelection("去知乎看看数字生命卡兹克最新第 4 + 1 - 12 篇文章", 20),
    /requested ordinal -7 is invalid/
  );
});
