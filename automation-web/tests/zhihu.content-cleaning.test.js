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

test("cleans Zhihu image attribute noise from article content", () => {
  const [item] = normalizeListItems(
    { url: "https://www.zhihu.com/people/Khazix/posts" },
    [{
      title: "测试文章",
      type: "article",
      url: "https://api.zhihu.com/articles/1",
      author: { name: "数字生命卡兹克", url_token: "Khazix" },
      created: 1772769600,
      updated: 1772769601,
      excerpt: "摘要文本",
      content: '第一段。\n\n" data-caption="" data-size="normal" class="origin_image zh-lightbox-thumb lazy" width="593" data-original="https://pic4.zhimg.com/v2-abc.jpg" data-actualsrc="https://pic4.zhimg.com/v2-def.jpg">\n\n第二段。'
    }]
  );

  assert.match(item.article_content, /第一段/);
  assert.match(item.article_content, /第二段/);
  assert.doesNotMatch(item.article_content, /data-caption=/);
  assert.doesNotMatch(item.article_content, /origin_image/);
  assert.doesNotMatch(item.article_content, /pic4\.zhimg\.com/);
});
