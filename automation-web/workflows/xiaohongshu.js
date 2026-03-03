"use strict";

const fs = require("fs");
const { toResult, looksLikeHumanIntervention } = require("../core/result");
const { grabBodyText, makeScreenshot, compactList } = require("../core/browser");

const FOOTER_OR_NAV_RE = /(沪icp|营业执照|公网安备|违法不良|行吟信息科技|创作中心|业务合作|通知|更多|全部|图文|视频|筛选)/i;

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeExploreUrl(raw) {
  const href = String(raw || "").trim();
  if (!href) return "";
  try {
    const u = new URL(href);
    const p = u.pathname || "";
    if (p.startsWith("/search_result/")) {
      const id = p.split("/").filter(Boolean).pop();
      if (id) return `${u.origin}/explore/${id}`;
    }
    if (p.startsWith("/explore/")) {
      return `${u.origin}${p}`;
    }
    return `${u.origin}${p}`;
  } catch (_err) {
    return href;
  }
}

function isValidNoteTitle(title) {
  const t = cleanText(title);
  if (!t || t.length < 4) return false;
  if (FOOTER_OR_NAV_RE.test(t) && t.length < 20) return false;
  if (/^(大家都在搜|更多|全部|图文|视频|用户|筛选|综合)$/.test(t)) return false;
  return true;
}

async function extractXhsItems(page, max = 40) {
  const raw = await page.evaluate((maxItems) => {
    const out = [];
    const seen = new Set();

    function pushItem(anchor) {
      const href = String(anchor?.href || "").trim();
      if (!href) return;
      if (!(href.includes("/explore/") || href.includes("/search_result/"))) return;

      let normalized = href;
      try {
        const u = new URL(href, location.origin);
        if ((u.pathname || "").startsWith("/search_result/")) {
          const id = u.pathname.split("/").filter(Boolean).pop();
          if (id) normalized = `${u.origin}/explore/${id}`;
        } else {
          normalized = `${u.origin}${u.pathname}`;
        }
      } catch (_err) {
        // ignore
      }

      if (seen.has(normalized)) return;
      seen.add(normalized);

      const card =
        anchor.closest("section") ||
        anchor.closest("article") ||
        anchor.closest('[class*="note"]') ||
        anchor.closest('[class*="feed"]') ||
        anchor.parentElement;

      const titleNodes = card
        ? [
            card.querySelector("h1, h2, h3"),
            card.querySelector('[class*="title"]'),
            card.querySelector('[class*="desc"]'),
            card.querySelector('[class*="name"]'),
          ]
        : [];

      let title = "";
      for (const n of titleNodes) {
        const txt = (n?.textContent || "").trim().replace(/\s+/g, " ");
        if (txt && txt.length >= 4) {
          title = txt;
          break;
        }
      }

      if (!title) {
        title = (anchor.textContent || "").trim().replace(/\s+/g, " ");
      }

      const cardText = (card?.innerText || "").trim().replace(/\s+/g, " ");
      if (!title && cardText) {
        title = cardText.slice(0, 90);
      }

      out.push({
        title,
        url: normalized,
        raw_url: href,
        card_text: cardText.slice(0, 260),
      });
    }

    const anchors = Array.from(document.querySelectorAll("a[href]"));
    for (const a of anchors) {
      pushItem(a);
      if (out.length >= maxItems) break;
    }

    return out;
  }, max);

  const out = [];
  const seen = new Set();
  for (const it of raw) {
    const url = normalizeExploreUrl(it.url || it.raw_url || "");
    if (!url || seen.has(url)) continue;

    const title = cleanText(it.title || it.card_text || "");
    if (!isValidNoteTitle(title)) continue;

    seen.add(url);
    out.push({
      title,
      url,
    });
  }
  return out;
}

async function runXhsSearch(page, cmd) {
  const query = cmd.query || "";
  if (!query) {
    return toResult({ success: false, exit_code: 1, message: "小红书搜索缺少 query。", meta: { cmd } });
  }

  const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  let bodyText = await grabBodyText(page, 12000);
  let needHuman = looksLikeHumanIntervention(bodyText, page.url());

  let items = await extractXhsItems(page, 50);

  if (items.length === 0 && !needHuman) {
    try {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1300);
      const more = await extractXhsItems(page, 50);
      const map = new Map(items.map((x) => [x.url, x]));
      for (const m of more) map.set(m.url, m);
      items = Array.from(map.values());
      bodyText = await grabBodyText(page, 12000);
      needHuman = looksLikeHumanIntervention(bodyText, page.url());
    } catch (_err) {
      // ignore
    }
  }

  const top = compactList(items, cmd.limit || 10);
  const shot = await makeScreenshot(page, "xhs-search");
  const listText = top.length
    ? top.map((r, idx) => `${idx + 1}. ${r.title} (${r.url})`).join("\n")
    : "未提取到笔记列表。";

  const noResult = top.length === 0;

  return toResult({
    success: !needHuman && !noResult,
    exit_code: needHuman ? 2 : (noResult ? 6 : 0),
    screenshot: shot.base64,
    message: needHuman
      ? `小红书页面需要登录或验证，请人工接管后重试。\n当前关键词：${query}`
      : (noResult
        ? `小红书搜索未提取到结果，关键词：${query}`
        : `小红书搜索完成，关键词：${query}\n${listText}`),
    meta: {
      site: "xiaohongshu",
      action: "search_notes",
      query,
      results: top,
      requires_human: needHuman,
      screenshot_path: shot.filePath,
      page_excerpt: bodyText.slice(0, 1200),
    },
  });
}

async function fillContentEditable(locator, text) {
  await locator.click({ timeout: 2000 });
  await locator.fill("");
  await locator.type(text, { delay: 8 });
}

async function runXhsPublish(page, cmd) {
  const payload = cmd.payload || {};
  await page.goto("https://creator.xiaohongshu.com/publish/publish", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2200);

  const bodyText = await grabBodyText(page, 12000);
  const needHuman = looksLikeHumanIntervention(bodyText, page.url());

  const steps = [];

  if (Array.isArray(payload.images) && payload.images.length) {
    const exists = payload.images.filter((p) => fs.existsSync(p));
    if (exists.length) {
      try {
        const input = page.locator('input[type="file"]').first();
        await input.setInputFiles(exists, { timeout: 8000 });
        steps.push(`已上传图片 ${exists.length} 张`);
      } catch (_err) {
        steps.push("未找到上传控件，图片未自动上传");
      }
    } else {
      steps.push("图片路径不存在，已跳过图片上传");
    }
  }

  if (payload.title) {
    try {
      const titleInput = page.locator('input[placeholder*="标题"], textarea[placeholder*="标题"]').first();
      await titleInput.fill(String(payload.title), { timeout: 3000 });
      steps.push("已填写标题");
    } catch (_err) {
      steps.push("未找到标题输入框");
    }
  }

  if (payload.content) {
    let filled = false;
    try {
      const textArea = page
        .locator('textarea[placeholder*="描述"], textarea[placeholder*="正文"], textarea[placeholder*="内容"]')
        .first();
      await textArea.fill(String(payload.content), { timeout: 3000 });
      steps.push("已填写正文");
      filled = true;
    } catch (_err) {
      // ignore
    }

    if (!filled) {
      try {
        const editable = page.locator('[contenteditable="true"]').first();
        await fillContentEditable(editable, String(payload.content));
        steps.push("已填写正文(contenteditable)");
      } catch (_err) {
        steps.push("未找到正文输入框");
      }
    }
  }

  let published = false;
  const allowPublish = process.env.WEB_PUBLISH_CONFIRM === "1" || Boolean(payload.shouldPublish);
  if (allowPublish && !needHuman) {
    try {
      const btn = page.locator('button:has-text("发布")').first();
      await btn.click({ timeout: 3000 });
      published = true;
      steps.push("已点击发布按钮");
    } catch (_err) {
      steps.push("未找到发布按钮");
    }
  } else {
    steps.push("默认未点击最终发布按钮（安全模式）");
  }

  const shot = await makeScreenshot(page, "xhs-publish");

  if (needHuman) {
    return toResult({
      success: false,
      exit_code: 2,
      screenshot: shot.base64,
      message: "小红书发布页需要登录或验证，请先手动处理。",
      meta: {
        site: "xiaohongshu",
        action: "publish_note",
        payload,
        steps,
        published,
        requires_human: true,
        screenshot_path: shot.filePath,
        page_excerpt: bodyText.slice(0, 1200),
      },
    });
  }

  return toResult({
    success: true,
    exit_code: 0,
    screenshot: shot.base64,
    message: published ? "小红书发布流程已执行（已点击发布）。" : "小红书发布草稿准备完成，请人工确认后发布。",
    meta: {
      site: "xiaohongshu",
      action: "publish_note",
      payload,
      steps,
      published,
      requires_human: !published,
      screenshot_path: shot.filePath,
      page_excerpt: bodyText.slice(0, 1200),
    },
  });
}

module.exports = {
  runXhsSearch,
  runXhsPublish,
};
