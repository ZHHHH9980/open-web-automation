#!/usr/bin/env node
"use strict";

const assert = require("assert");
const scrapeList = require("../flows/act/actions/definitions/scrape-list");

const action = {
  action: "scrape_list",
  author: "数字生命卡兹克",
  exact_author: true,
  latest_only: true,
  max_items: 1,
};

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✓ ${name}`);
    })
    .catch((error) => {
      console.error(`✗ ${name}`);
      throw error;
    });
}

async function run() {
  await test("allows Zhihu author search scrape_list before API capture exists", () => {
    const state = {
      url: "https://www.zhihu.com/search?type=content&q=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B",
      api_responses: [],
    };

    assert.equal(scrapeList.canExecute(action, state, {}), true);
    assert.match(scrapeList.explainCanExecute(action, state, {}), /load the list API lazily/i);
  });

  await test("executes Zhihu author search scrape_list from live collector data", async () => {
    const page = {
      url() {
        return "https://www.zhihu.com/search?type=content&q=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B";
      },
      mouse: {
        async wheel() {},
      },
      async waitForTimeout() {},
    };

    const state = {
      url: page.url(),
      api_responses: [],
    };

    const context = {
      currentApiCollector: {
        getData() {
          return [{
            url: "https://www.zhihu.com/api/v4/search_v3?offset=0",
            data: {
              data: [
                {
                  object: {
                    title: "最新文章",
                    url: "https://zhuanlan.zhihu.com/p/1",
                    published_time: 1710000000,
                    author: {
                      name: "数字生命卡兹克",
                      url_token: "Khazix",
                    },
                    excerpt: "摘要",
                  },
                },
              ],
            },
          }];
        },
      },
    };

    const result = await scrapeList.execute(page, action, state, context);
    assert.equal(result.data.count, 1);
    assert.equal(result.data.display_items[0].author, "数字生命卡兹克");
    assert.equal(result.data.display_items[0].author_profile_url, "https://www.zhihu.com/people/Khazix");
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
