#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { resolveCurrentUserProfile, resolveCapturedItemUrl } = require("../flows/act/actions/definitions/helpers");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const context = {
  currentApiCollector: {
    getData() {
      return [
        {
          url: "https://www.zhihu.com/api/v4/me?include=is_realname",
          data: {
            id: "c45738515e73f1c12b41b7bb0de511f1",
            url_token: "wx807252b6874eeff6",
            name: "zhGoToBed"
          }
        }
      ];
    }
  },
  lastListCapture: {
    items: [{ id: 1 }],
    display_items: [{
      author: "数字生命卡兹克",
      author_profile_url: "https://www.zhihu.com/people/Khazix",
    }],
  },
};

test("resolves current Zhihu user profile from api/v4/me", () => {
  const profile = resolveCurrentUserProfile({ url: "https://www.zhihu.com/" }, context);
  assert.equal(profile.ok, true);
  assert.equal(profile.url_token, "wx807252b6874eeff6");
  assert.equal(profile.following_url, "https://www.zhihu.com/people/wx807252b6874eeff6/following");
});

test("replaces current user placeholders in goto URLs", () => {
  const resolved = resolveCapturedItemUrl("{{current_user_following_url}}", context, { url: "https://www.zhihu.com/" });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.url, "https://www.zhihu.com/people/wx807252b6874eeff6/following");
});

test("replaces current user token inside longer URLs", () => {
  const resolved = resolveCapturedItemUrl("https://www.zhihu.com/people/{{current_user_url_token}}/followers", context, { url: "https://www.zhihu.com/" });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.url, "https://www.zhihu.com/people/wx807252b6874eeff6/followers");
});

test("resolves captured author posts placeholder from last list capture", () => {
  const resolved = resolveCapturedItemUrl("{{item_1_author_posts_url}}", context, { url: "https://www.zhihu.com/search?q=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B" });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.url, "https://www.zhihu.com/people/Khazix/posts");
});
