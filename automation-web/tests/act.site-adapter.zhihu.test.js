#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { zhihu } = require("../flows/act/site-adapters");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

const context = {
  currentApiCollector: {
    getData() {
      return [{
        url: "https://www.zhihu.com/api/v4/me?include=is_realname",
        data: { url_token: "Khazix" },
      }];
    },
  },
  lastListCapture: {
    items: [{ id: 1, url: "/answer/1" }],
    display_items: [{ author_profile_url: "https://www.zhihu.com/people/Khazix" }],
  },
};

test("act zhihu adapter resolves current user profile", () => {
  const profile = zhihu.resolveCurrentUserProfile({ url: "https://www.zhihu.com/" }, context);
  assert.equal(profile.ok, true);
  assert.equal(profile.posts_url, "https://www.zhihu.com/people/Khazix/posts");
});

test("act zhihu adapter resolves captured author posts placeholder", () => {
  const resolved = zhihu.resolveCapturedItemUrl("{{item_1_author_posts_url}}", context, { url: "https://www.zhihu.com/search?q=test" });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.url, "https://www.zhihu.com/people/Khazix/posts");
});

test("act zhihu adapter keeps scrolling search results until exact author appears", async () => {
  let phase = 0;
  const page = {
    url() {
      return "https://www.zhihu.com/search?type=content&q=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B";
    },
    mouse: {
      async wheel() {
        phase += 1;
      },
    },
    async waitForTimeout() {},
  };

  const result = await zhihu.collectListEntries(
    page,
    { url: page.url() },
    {
      currentApiCollector: {
        getData() {
          return phase === 0
            ? [{ url: "https://www.zhihu.com/api/v4/search_v3?offset=0", data: {} }]
            : [
              { url: "https://www.zhihu.com/api/v4/search_v3?offset=0", data: {} },
              { url: "https://www.zhihu.com/api/v4/search_v3?offset=20", data: {} },
            ];
        },
      },
    },
    {
      author: "数字生命卡兹克",
      exact_author: true,
    },
    {
      maxItems: 50,
      defaultCollector() {
        throw new Error("should not use generic collector for zhihu author search");
      },
      resolveConfiguredApi() {
        return {
          apiConfig: { items_path: "data" },
          endpoint: "https://www.zhihu.com/api/v4/search_v3",
        };
      },
      getLiveApiResponses(_state, innerContext) {
        return innerContext.currentApiCollector.getData();
      },
      buildStructuredEntries(_state, _endpoint, _itemsPath, apiResponses) {
        return apiResponses.length > 1
          ? [{ display: { author: "数字生命卡兹克", title: "最新文章" } }]
          : [{ display: { author: "其他作者", title: "无关文章" } }];
      },
    }
  );

  assert.equal(phase > 0, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].display.author, "数字生命卡兹克");
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
