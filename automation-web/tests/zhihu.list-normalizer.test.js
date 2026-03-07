#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { normalizeListItems } = require("../flows/act/actions/definitions/list-normalizers");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const sampleState = {
  url: "https://www.zhihu.com/search?type=content&q=openclaw",
};

const sampleItems = [
  {
    type: "hot_timing",
    object: {
      description: {
        object: {
          id: "2013291955518404067",
          type: "question",
          title: "<em>OpenClaw</em> 爆火背后，这种 AI 工作流，真能替代现有的办公习惯吗？",
          description: "最近 OpenClaw 刷屏了，很多人说它颠覆了工作流。",
          url: "https://api.zhihu.com/questions/2013291955518404067"
        }
      },
      content_items: [
        {
          sub_contents: [
            {
              object: {
                id: "2013300633852190741",
                type: "answer",
                excerpt: "OpenClaw 代表的 AI 工作流不是短期噱头，但也还没到完全成熟。",
                voteup_count: 4,
                url: "https://api.zhihu.com/answers/2013300633852190741",
                question: {
                  id: "2013291955518404067"
                },
                author: {
                  name: "精品全球域名注册"
                }
              }
            }
          ]
        }
      ]
    }
  }
];

test("normalizes Zhihu item into structured fields", () => {
  const [item] = normalizeListItems(sampleState, sampleItems);
  assert.equal(item.title, "OpenClaw 爆火背后，这种 AI 工作流，真能替代现有的办公习惯吗？");
  assert.equal(item.author, "精品全球域名注册");
  assert.equal(item.likes, 4);
  assert.equal(item.detail_url, "https://www.zhihu.com/question/2013291955518404067/answer/2013300633852190741");
  assert.match(item.content_summary, /OpenClaw 代表的 AI 工作流/);
  assert.match(item.article_content, /OpenClaw 代表的 AI 工作流/);
});


test("filters out Zhihu people-style noise results", () => {
  const items = normalizeListItems(sampleState, [
    ...sampleItems,
    {
      type: "search_result",
      object: {
        url: "https://api.zhihu.com/people/87a006f84014d572d902ba9c5e5f230b",
        type: "people"
      }
    }
  ]);

  assert.equal(items.length, 1);
});


test("normalizes Zhihu browse feed items", () => {
  const [item] = normalizeListItems(
    { url: "https://www.zhihu.com/" },
    [{
      type: "feed",
      target: {
        id: "2013167499231900461",
        type: "answer",
        excerpt: "昨天晚上刚看完的发布会，基本就是跪着看完的。",
        content: "<p>昨天晚上刚看完的发布会，</p><p>基本就是跪着看完的。</p>",
        voteup_count: 458,
        url: "https://api.zhihu.com/answers/2013167499231900461",
        author: { name: "涂朗" },
        question: {
          id: "10783732020",
          title: "比亚迪会倒闭吗？"
        }
      }
    }]
  );

  assert.equal(item.title, "比亚迪会倒闭吗？");
  assert.equal(item.author, "涂朗");
  assert.equal(item.likes, 458);
  assert.equal(item.detail_url, "https://www.zhihu.com/question/10783732020/answer/2013167499231900461");
  assert.match(item.content_summary, /昨天晚上刚看完的发布会/);
});
