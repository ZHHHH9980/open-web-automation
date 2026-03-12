#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { __internal } = require("../flows/finish/conclusion-generator");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((error) => {
      console.error(`✗ ${name}`);
      throw error;
    });
}

test("detects dangling subordinate clauses", () => {
  assert.equal(__internal.isDanglingClause("当越来越多的人使用飞书的时候"), true);
  assert.equal(__internal.isDanglingClause("Mac 适合跑 Agent，因为 Unix 和统一内存架构。"), false);
});
