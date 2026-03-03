"use strict";

const { toResult, looksLikeHumanIntervention } = require("../core/result");
const { safeClickByText, grabBodyText, makeScreenshot, compactList, sameName } = require("../core/browser");

async function runZhihuFollowLookup(page, cmd) {
  const query = cmd.query || "";
  if (query) {
    const u = `https://www.zhihu.com/search?type=people&q=${encodeURIComponent(query)}`;
    await page.goto(u, { waitUntil: "domcontentloaded" });
  } else {
    await page.goto("https://www.zhihu.com/follow", { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(2200);
  const bodyText = await grabBodyText(page, 8000);
  const needHuman = looksLikeHumanIntervention(bodyText, page.url());

  const people = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('a[href*="/people/"]'));
    for (const a of links) {
      const url = a.href || "";
      if (!url || seen.has(url)) continue;
      const txt = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!txt) continue;
      seen.add(url);
      out.push({ name: txt, url });
      if (out.length >= 30) break;
    }
    return out;
  });

  const top = compactList(people, cmd.limit || 10);
  if (query && top.length) {
    try {
      await page.goto(top[0].url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
    } catch (_err) {
      // ignore
    }
  }

  const shot = await makeScreenshot(page, "zhihu-follow-lookup");
  const listText = top.length
    ? top.map((p, idx) => `${idx + 1}. ${p.name} (${p.url})`).join("\n")
    : "未提取到博主列表。";

  return toResult({
    success: !needHuman,
    exit_code: needHuman ? 2 : 0,
    screenshot: shot.base64,
    message: needHuman
      ? "知乎页面需要登录或验证，请你手动处理后再继续。"
      : (query ? `知乎博主检索完成，关键词：${query}\n${listText}` : `知乎关注页抓取完成\n${listText}`),
    meta: {
      site: "zhihu",
      action: "follow_lookup",
      query,
      people: top,
      requires_human: needHuman,
      screenshot_path: shot.filePath,
      page_excerpt: bodyText.slice(0, 1200),
    },
  });
}

async function runZhihuSearch(page, cmd) {
  const query = cmd.query || "";
  if (!query) {
    return toResult({ success: false, exit_code: 1, message: "知乎搜索缺少 query。", meta: { cmd } });
  }

  const u = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(query)}`;
  await page.goto(u, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);

  const bodyText = await grabBodyText(page, 9000);
  const needHuman = looksLikeHumanIntervention(bodyText, page.url());
  const items = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll("a"));
    for (const a of links) {
      const href = a.href || "";
      if (!href.includes("zhihu.com/question") && !href.includes("zhihu.com/p/")) continue;
      if (seen.has(href)) continue;
      const title = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!title) continue;
      seen.add(href);
      out.push({ title, url: href });
      if (out.length >= 30) break;
    }
    return out;
  });

  const top = compactList(items, cmd.limit || 10);
  const shot = await makeScreenshot(page, "zhihu-search");
  const listText = top.length
    ? top.map((r, idx) => `${idx + 1}. ${r.title} (${r.url})`).join("\n")
    : "未提取到搜索结果。";

  return toResult({
    success: !needHuman,
    exit_code: needHuman ? 2 : 0,
    screenshot: shot.base64,
    message: needHuman
      ? `知乎页面触发验证或登录，请人工接管后重试。\n当前关键词：${query}`
      : `知乎搜索完成，关键词：${query}\n${listText}`,
    meta: {
      site: "zhihu",
      action: "search",
      query,
      results: top,
      requires_human: needHuman,
      screenshot_path: shot.filePath,
      page_excerpt: bodyText.slice(0, 1200),
    },
  });
}

async function runZhihuLatestAnswer(page, cmd) {
  const creator = cmd.creator || "";
  if (!creator) {
    return toResult({
      success: false,
      exit_code: 1,
      message: "latest_answer 缺少 creator。",
      meta: { cmd },
    });
  }

  const searchUrl = `https://www.zhihu.com/search?type=people&q=${encodeURIComponent(creator)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);

  const searchPageText = await grabBodyText(page, 9000);
  const needHumanOnSearch = looksLikeHumanIntervention(searchPageText, page.url());

  let people = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('a[href*="/people/"]'));
    for (const a of links) {
      const href = (a.href || "").trim();
      if (!href || seen.has(href)) continue;
      const name = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!name) continue;
      seen.add(href);
      out.push({ name, href });
      if (out.length >= 30) break;
    }
    return out;
  });

  if (people.length === 0) {
    try {
      const q = encodeURIComponent(`site:zhihu.com/people ${creator} 知乎`);
      await page.goto(`https://www.google.com/search?q=${q}&hl=zh-CN`, { waitUntil: "domcontentloaded" });
      await safeClickByText(page, ["I agree", "Accept all", "同意", "接受全部"]);
      await page.waitForTimeout(1600);
      people = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        const links = Array.from(document.querySelectorAll('a[href*="zhihu.com/people/"]'));
        for (const a of links) {
          const href = (a.href || "").trim();
          if (!href || seen.has(href)) continue;
          const name = (a.textContent || "").trim().replace(/\s+/g, " ");
          seen.add(href);
          out.push({ name: name || href.split("/").pop() || "", href });
          if (out.length >= 10) break;
        }
        return out;
      });
    } catch (_err) {
      // ignore
    }
  }

  if (needHumanOnSearch && people.length === 0) {
    const shot = await makeScreenshot(page, "zhihu-latest-answer-login");
    return toResult({
      success: false,
      exit_code: 2,
      screenshot: shot.base64,
      message: "知乎页面需要登录或验证，请先人工处理后再继续。",
      meta: {
        site: "zhihu",
        action: "latest_answer",
        creator,
        requires_human: true,
        screenshot_path: shot.filePath,
        page_excerpt: searchPageText.slice(0, 1200),
      },
    });
  }

  let exact = people.find((p) => sameName(p.name, creator));
  if (!exact && people.length > 0) exact = people[0];

  if (!exact) {
    const shot = await makeScreenshot(page, "zhihu-latest-answer-notfound");
    return toResult({
      success: false,
      exit_code: 4,
      screenshot: shot.base64,
      message: `未匹配到博主“${creator}”。`,
      meta: {
        site: "zhihu",
        action: "latest_answer",
        creator,
        candidates: compactList(people, 10),
        requires_human: false,
        screenshot_path: shot.filePath,
        page_excerpt: searchPageText.slice(0, 1200),
      },
    });
  }

  const base = exact.href.replace(/\/+$/, "");
  const answersUrl = `${base}/answers`;
  await page.goto(answersUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);

  try {
    await page.waitForSelector('a[href*="/question/"][href*="/answer/"]', { timeout: 8000 });
  } catch (_err) {
    try {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(1000);
      await page.waitForSelector('a[href*="/question/"][href*="/answer/"]', { timeout: 4000 });
    } catch (_err2) {
      // keep fallback
    }
  }

  const answerPageText = await grabBodyText(page, 10000);
  const needHumanOnAnswerPage = looksLikeHumanIntervention(answerPageText, page.url());

  const latest = await page.evaluate(() => {
    const first = document.querySelector('a[href*="/question/"][href*="/answer/"]');
    if (!first) return null;
    const title = (first.textContent || "").trim().replace(/\s+/g, " ");
    const url = (first.href || "").trim();
    const card = first.closest(".List-item") || first.closest(".ContentItem") || first.closest(".AnswerItem") || first.parentElement;
    const t = card?.querySelector("time")?.getAttribute("datetime") || card?.querySelector("time")?.textContent || "";
    const text = (card?.innerText || title || "").replace(/\s+/g, " ").trim();
    const snippet = text.length > 260 ? `${text.slice(0, 260)}...` : text;
    return { title, url, time: String(t).trim(), snippet };
  });

  const shot = await makeScreenshot(page, "zhihu-latest-answer");
  if (!latest && needHumanOnAnswerPage) {
    return toResult({
      success: false,
      exit_code: 2,
      screenshot: shot.base64,
      message: "进入博主回答页后触发登录/验证，请人工接管后重试。",
      meta: {
        site: "zhihu",
        action: "latest_answer",
        creator,
        person: exact,
        requires_human: true,
        screenshot_path: shot.filePath,
        page_excerpt: answerPageText.slice(0, 1200),
      },
    });
  }

  if (!latest) {
    return toResult({
      success: false,
      exit_code: 5,
      screenshot: shot.base64,
      message: `已找到博主“${creator}”，但未提取到回答内容。`,
      meta: {
        site: "zhihu",
        action: "latest_answer",
        creator,
        person: exact,
        requires_human: false,
        screenshot_path: shot.filePath,
        page_excerpt: answerPageText.slice(0, 1200),
      },
    });
  }

  let detail = null;
  try {
    await page.goto(latest.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
    detail = await page.evaluate(() => {
      const t = document.querySelector("time")?.getAttribute("datetime") || document.querySelector("time")?.textContent || "";
      const paragraphs = Array.from(document.querySelectorAll(".RichText p, .RichText span, p"))
        .map((x) => (x.textContent || "").trim())
        .filter(Boolean)
        .filter((x) => x.length > 3);
      const summary = paragraphs.slice(0, 3).join(" ");
      return { time: String(t).trim(), summary };
    });
  } catch (_err) {
    // ignore
  }

  const finalTime = (detail && detail.time) || latest.time || "";
  const finalSnippet = (detail && detail.summary) || latest.snippet || "";

  return toResult({
    success: true,
    exit_code: 0,
    screenshot: shot.base64,
    message: [
      `博主：${exact.name}`,
      `最新回答：${latest.title}`,
      finalTime ? `时间：${finalTime}` : "",
      `链接：${latest.url}`,
      finalSnippet ? `摘要：${finalSnippet}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    meta: {
      site: "zhihu",
      action: "latest_answer",
      creator,
      person: exact,
      latest_answer: { ...latest, time: finalTime, snippet: finalSnippet },
      requires_human: false,
      screenshot_path: shot.filePath,
      page_excerpt: answerPageText.slice(0, 1200),
    },
  });
}

async function runZhihuSearchTopAnswer(page, cmd) {
  const query = cmd.query || "";
  if (!query) {
    return toResult({ success: false, exit_code: 1, message: "search_top_answer 缺少 query。", meta: { cmd } });
  }

  const u = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(query)}`;
  await page.goto(u, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const bodyText = await grabBodyText(page, 12000);
  const needHuman = looksLikeHumanIntervention(bodyText, page.url());

  const answers = await page.evaluate(() => {
    const parseVotes = (text) => {
      if (!text) return 0;
      const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([万wW]?)/);
      if (!m) return 0;
      const n = Number(m[1]);
      if (!Number.isFinite(n)) return 0;
      if (m[2]) return Math.round(n * 10000);
      return Math.round(n);
    };

    const out = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('a[href*="/answer/"]'));
    for (const a of links) {
      const url = (a.href || "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const card = a.closest(".SearchItem") || a.closest(".List-item") || a.closest(".ContentItem") || a.parentElement;
      const title = (a.textContent || card?.querySelector("h2")?.textContent || "").trim().replace(/\s+/g, " ");
      const cardText = (card?.innerText || "").replace(/\s+/g, " ");
      let vote = 0;
      const voteMatch =
        cardText.match(/(\d+(?:\.\d+)?\s*[万wW]?)\s*(?:赞同|点赞|赞)/) ||
        cardText.match(/(?:赞同|点赞|赞)[^0-9]{0,6}(\d+(?:\.\d+)?\s*[万wW]?)/);
      if (voteMatch) vote = parseVotes(voteMatch[1]);

      if (!title) continue;
      out.push({ title, url, vote, snippet: cardText.slice(0, 200) });
      if (out.length >= 40) break;
    }
    return out;
  });

  const sorted = [...answers].sort((a, b) => (b.vote || 0) - (a.vote || 0));
  const top = sorted[0] || null;
  const shot = await makeScreenshot(page, "zhihu-top-answer");

  if (needHuman && !top) {
    return toResult({
      success: false,
      exit_code: 2,
      screenshot: shot.base64,
      message: "知乎页面触发登录/验证，请人工接管后重试。",
      meta: {
        site: "zhihu",
        action: "search_top_answer",
        query,
        requires_human: true,
        screenshot_path: shot.filePath,
        page_excerpt: bodyText.slice(0, 1200),
      },
    });
  }

  if (!top) {
    return toResult({
      success: false,
      exit_code: 4,
      screenshot: shot.base64,
      message: `未提取到“${query}”相关回答。`,
      meta: {
        site: "zhihu",
        action: "search_top_answer",
        query,
        results: compactList(sorted, 10),
        requires_human: false,
        screenshot_path: shot.filePath,
        page_excerpt: bodyText.slice(0, 1200),
      },
    });
  }

  return toResult({
    success: true,
    exit_code: 0,
    screenshot: shot.base64,
    message: [
      `关键词：${query}`,
      `最高赞候选：${top.title}`,
      top.vote ? `赞同数(解析)：${top.vote}` : "赞同数(解析)：未知",
      `链接：${top.url}`,
      top.snippet ? `摘要：${top.snippet}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    meta: {
      site: "zhihu",
      action: "search_top_answer",
      query,
      top_answer: top,
      results: compactList(sorted, 10),
      requires_human: false,
      screenshot_path: shot.filePath,
      page_excerpt: bodyText.slice(0, 1200),
    },
  });
}

async function runZhihuFollowNthPost(page, cmd) {
  const creatorIndex = cmd.creator_index || 3;
  const postIndex = cmd.post_index || 2;

  await page.goto("https://www.zhihu.com/follow", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  const followText = await grabBodyText(page, 10000);
  const needHuman = looksLikeHumanIntervention(followText, page.url());

  const creators = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('a[href*="/people/"]'));
    for (const a of links) {
      const href = (a.href || "").trim();
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const name = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!name) continue;
      out.push({ name, href });
      if (out.length >= 40) break;
    }
    return out;
  });

  const creator = creators[creatorIndex - 1] || null;
  if (!creator && needHuman) {
    const shot = await makeScreenshot(page, "zhihu-follow-nth-login");
    return toResult({
      success: false,
      exit_code: 2,
      screenshot: shot.base64,
      message: "知乎关注页需要登录/验证，请人工处理后重试。",
      meta: {
        site: "zhihu",
        action: "follow_nth_post",
        creator_index: creatorIndex,
        post_index: postIndex,
        requires_human: true,
        screenshot_path: shot.filePath,
        page_excerpt: followText.slice(0, 1200),
      },
    });
  }

  if (!creator) {
    const shot = await makeScreenshot(page, "zhihu-follow-nth-notfound");
    return toResult({
      success: false,
      exit_code: 4,
      screenshot: shot.base64,
      message: `关注列表不足第 ${creatorIndex} 个博主。`,
      meta: {
        site: "zhihu",
        action: "follow_nth_post",
        creator_index: creatorIndex,
        post_index: postIndex,
        creators: compactList(creators, 10),
        requires_human: false,
        screenshot_path: shot.filePath,
        page_excerpt: followText.slice(0, 1200),
      },
    });
  }

  const postsUrl = `${creator.href.replace(/\/+$/, "")}/posts`;
  await page.goto(postsUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);

  const postsText = await grabBodyText(page, 10000);
  const posts = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('a[href*="zhihu.com/p/"]'));
    for (const a of links) {
      const href = (a.href || "").trim();
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const title = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!title) continue;
      out.push({ title, url: href });
      if (out.length >= 30) break;
    }
    return out;
  });

  const post = posts[postIndex - 1] || null;
  const shot = await makeScreenshot(page, "zhihu-follow-nth-post");
  if (!post) {
    return toResult({
      success: false,
      exit_code: 5,
      screenshot: shot.base64,
      message: `博主 ${creator.name} 的文章列表不足第 ${postIndex} 篇。`,
      meta: {
        site: "zhihu",
        action: "follow_nth_post",
        creator_index: creatorIndex,
        post_index: postIndex,
        creator,
        posts: compactList(posts, 10),
        requires_human: false,
        screenshot_path: shot.filePath,
        page_excerpt: postsText.slice(0, 1200),
      },
    });
  }

  return toResult({
    success: true,
    exit_code: 0,
    screenshot: shot.base64,
    message: [
      `关注第 ${creatorIndex} 位博主：${creator.name}`,
      `第 ${postIndex} 篇文章：${post.title}`,
      `链接：${post.url}`,
    ].join("\n"),
    meta: {
      site: "zhihu",
      action: "follow_nth_post",
      creator_index: creatorIndex,
      post_index: postIndex,
      creator,
      post,
      requires_human: false,
      screenshot_path: shot.filePath,
      page_excerpt: postsText.slice(0, 1200),
    },
  });
}

module.exports = {
  runZhihuFollowLookup,
  runZhihuSearch,
  runZhihuLatestAnswer,
  runZhihuSearchTopAnswer,
  runZhihuFollowNthPost,
};
