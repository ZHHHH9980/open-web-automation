#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { __internal } = require("../launcher");

const { renderStructuredItems } = __internal;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("renders scrape_detail entries as readable cards", () => {
  const output = renderStructuredItems([
    {
      action: "scrape_detail",
      label: "仗再打下去，迪拜就变废渣了",
      parsed: {
        detail: {
          title: "仗再打下去，迪拜就变废渣了",
          type: "video",
          desc: "2周前迪拜是全球首选的避税天堂，航运中心。然而现在人都在逃离迪拜。",
          time: 1772880277000,
          ip_location: "澳大利亚",
          interact_info: {
            liked_count: "87",
            collected_count: "9",
            comment_count: "44",
            share_count: "15"
          },
          user: {
            nickname: "小祎"
          },
          video: {
            media: {
              stream: {
                h264: [{ master_url: "http://example.com/video.mp4" }]
              }
            }
          }
        }
      }
    }
  ]);

  assert.match(output, /## 1\. 仗再打下去，迪拜就变废渣了/);
  assert.match(output, /- 作者：小祎/);
  assert.match(output, /- 类型：video/);
  assert.match(output, /- 互动：87赞｜44评｜9藏｜15分享/);
  assert.match(output, /### 摘要/);
  assert.match(output, /### 链接/);
  assert.doesNotMatch(output, /采集的原始数据/);
});

test("renders scrape_list entries without empty like rows", () => {
  const output = renderStructuredItems([
    {
      action: "scrape_list",
      parsed: {
        items: [
          {
            title: "列表标题",
            author: "作者A",
            content_summary: "这是摘要",
            article_content: "这是摘要",
            detail_url: "https://example.com/post",
            likes: 0
          }
        ]
      }
    }
  ]);

  assert.match(output, /## 1\. 列表标题/);
  assert.match(output, /- 作者：作者A/);
  assert.match(output, /- 链接：https:\/\/example\.com\/post/);
  assert.doesNotMatch(output, /- 点赞：/);
  assert.doesNotMatch(output, /### 内容/);
});
