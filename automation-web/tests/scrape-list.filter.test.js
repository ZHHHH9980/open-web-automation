#!/usr/bin/env node
"use strict";

const assert = require("assert");
const scrapeList = require("../flows/act/actions/definitions/scrape-list");

const { applyEntryFilters, buildStructuredEntries } = scrapeList.__internal;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("filters exact author and sorts by publish time desc", () => {
  const entries = [
    { display: { title: "A", author: "数字生命卡兹克", publish_time: 1000 } },
    { display: { title: "B", author: "其他作者", publish_time: 999999 } },
    { display: { title: "C", author: "数字生命卡兹克", publish_time: 2000 } },
  ];

  const filtered = applyEntryFilters(entries, {
    author: "数字生命卡兹克",
    exact_author: true,
    latest_only: true,
  });

  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].display.title, "C");
  assert.equal(filtered[1].display.title, "A");
});

test("builds generic structured entries with state-aware filtering", () => {
  const entries = buildStructuredEntries(
    { url: "https://example.com/search?q=test" },
    "https://api.example.com/list",
    "data.items",
    [{
      url: "https://api.example.com/list?page=1",
      data: {
        data: {
          items: [
            { title: "第一篇", url: "https://example.com/posts/1", excerpt: "摘要" },
          ],
        },
      },
    }],
    10
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].display.title, "第一篇");
});
