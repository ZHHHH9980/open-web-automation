#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

function nowIso() {
  return new Date().toISOString();
}

function toResult(opts) {
  const meta = opts.meta || {};
  return {
    success: Boolean(opts.success),
    message: opts.message || "",
    has_screenshot: Boolean(opts.screenshot),
    screenshot: opts.screenshot || "",
    exit_code: opts.exit_code != null ? opts.exit_code : (opts.success ? 0 : 1),
    timestamp: nowIso(),
    meta,
  };
}

function pickQuoted(task) {
  const m = task.match(/["“”'「『]([^"“”'」』]+)["“”'」』]/);
  return m ? m[1].trim() : "";
}

function normalizeTask(task) {
  return String(task || "").replace(/\s+/g, " ").trim();
}

function extractSearchQuery(task) {
  const quoted = pickQuoted(task);
  if (quoted) return quoted;

  const patterns = [
    /(?:搜索|查找|搜一下|search)\s*[:：]?\s*(.+)$/i,
    /(?:在\s*(?:google|谷歌|知乎|小红书)\s*)?(?:找|查看)\s*(.+)$/i,
    /(?:博主|作者|用户)\s*[:：]?\s*(.+)$/i,
  ];
  for (const reg of patterns) {
    const m = task.match(reg);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

function cleanCreatorName(name) {
  if (!name) return "";
  return String(name)
    .replace(/^[：:\s]+|[，。！？!?,\s]+$/g, "")
    .replace(/^(这个|该)?(博主|作者|用户)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCreatorName(task) {
  const quoted = pickQuoted(task);
  if (quoted) return cleanCreatorName(quoted);

  const patterns = [
    /知乎\s+(.+?)\s*(?:这个|该)?(?:博主|作者|用户).*?(?:最新回答|最新的回答)/i,
    /知乎\s+(.+?)\s*(?:最新回答|最新的回答)/i,
    /(?:博主|作者|用户)\s+(.+?)\s*(?:这个|该)?(?:博主|作者|用户)?.*?(?:最新回答|最新的回答)/i,
    /(?:博主|作者|用户)\s+(.+?)\s*(?:的)?(?:最新回答|最新的回答)/i,
  ];
  for (const reg of patterns) {
    const m = task.match(reg);
    if (m && m[1]) return cleanCreatorName(m[1]);
  }
  return "";
}

function parsePublishPayload(task) {
  const payload = {
    title: "",
    content: "",
    images: [],
    shouldPublish: /立即发布|确认发布|马上发布/.test(task),
  };

  const titleMatch = task.match(/标题\s*[:：]\s*([\s\S]+?)(?=\s+(?:内容|图片)\s*[:：]|$)/);
  if (titleMatch) payload.title = titleMatch[1].trim();

  const contentMatch = task.match(/内容\s*[:：]\s*([\s\S]+?)(?:图片\s*[:：]|$)/);
  if (contentMatch) payload.content = contentMatch[1].trim();

  const imageMatch = task.match(/图片\s*[:：]\s*([^\n]+)/);
  if (imageMatch && imageMatch[1]) {
    payload.images = imageMatch[1]
      .split(/[，,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return payload;
}

function parseTask(rawTask) {
  const task = normalizeTask(rawTask);
  const lower = task.toLowerCase();

  if (!task) {
    return { site: "unknown", action: "unknown", task };
  }

  if (/google|谷歌/.test(lower) && /搜索|search|搜/.test(task)) {
    return {
      site: "google",
      action: "search",
      query: extractSearchQuery(task),
      task,
    };
  }

  if (/知乎/.test(task)) {
    if (/最新回答|最新的回答/.test(task)) {
      return {
        site: "zhihu",
        action: "latest_answer",
        creator: extractCreatorName(task),
        task,
      };
    }

    if (/关注|博主|作者|用户/.test(task)) {
      let query = extractSearchQuery(task);
      query = query.replace(/^(?:博主|作者|用户)\s*/i, "").trim();
      if (/^(?:关注的博主|关注博主|我关注的博主)$/i.test(query)) {
        query = "";
      }
      return {
        site: "zhihu",
        action: "follow_lookup",
        query,
        task,
      };
    }

    if (/搜索|search|搜/.test(task)) {
      return {
        site: "zhihu",
        action: "search",
        query: extractSearchQuery(task),
        task,
      };
    }
  }

  if (/小红书|rednote|xiaohongshu/i.test(task)) {
    if (/发布/.test(task)) {
      return {
        site: "xiaohongshu",
        action: "publish_note",
        payload: parsePublishPayload(task),
        task,
      };
    }

    if (/搜索|search|搜|查找|找/.test(task)) {
      return {
        site: "xiaohongshu",
        action: "search_notes",
        query: extractSearchQuery(task),
        task,
      };
    }
  }

  return {
    site: "unknown",
    action: "unknown",
    task,
  };
}

function looksLikeHumanIntervention(text, url) {
  const hay = `${text || ""}\n${url || ""}`.toLowerCase();
  const patterns = [
    /验证码/,
    /滑块/,
    /安全验证/,
    /请先登录/,
    /登录后/,
    /请完成验证/,
    /captcha/,
    /verify you are human/,
    /signin/,
    /login/,
  ];
  return patterns.some((re) => re.test(hay));
}

async function safeClickByText(page, textList) {
  for (const text of textList) {
    const locator = page.locator(`button:has-text("${text}")`).first();
    try {
      if (await locator.isVisible({ timeout: 500 })) {
        await locator.click({ timeout: 1500 });
        return true;
      }
    } catch (_err) {
      // ignore
    }
  }
  return false;
}

async function grabBodyText(page, limit = 3000) {
  try {
    const txt = await page.locator("body").innerText({ timeout: 1500 });
    return (txt || "").slice(0, limit);
  } catch (_err) {
    return "";
  }
}

function ensureScreenshotDir() {
  const dir = path.join(os.tmpdir(), "open-autoglm-web-shots");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function makeScreenshot(page, label) {
  const dir = ensureScreenshotDir();
  const fileName = `${Date.now()}-${label}.png`;
  const filePath = path.join(dir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  const b64 = fs.readFileSync(filePath).toString("base64");
  return { filePath, base64: b64 };
}

function compactList(items, max = 5) {
  return items
    .filter((it) => it && (it.title || it.url || it.name))
    .slice(0, max);
}

function sameName(a, b) {
  const x = String(a || "").toLowerCase().replace(/\s+/g, "");
  const y = String(b || "").toLowerCase().replace(/\s+/g, "");
  return x && y && (x === y || x.includes(y) || y.includes(x));
}

async function runGoogleSearch(page, task, parsed) {
  const query = parsed.query || "";
  if (!query) {
    return toResult({
      success: false,
      exit_code: 1,
      message: "Google 搜索缺少关键词，例如：Google 搜索 OpenAI",
      meta: { parsed },
    });
  }

  await page.goto("https://www.google.com/ncr", { waitUntil: "domcontentloaded" });
  await safeClickByText(page, ["I agree", "Accept all", "同意", "接受全部"]);

  let submitted = false;
  try {
    const input = page.locator('textarea[name="q"]').first();
    await input.waitFor({ timeout: 4000 });
    await input.fill(query);
    await page.keyboard.press("Enter");
    submitted = true;
  } catch (_err) {
    // fallback below
  }

  if (!submitted) {
    const q = encodeURIComponent(query);
    await page.goto(`https://www.google.com/search?q=${q}&hl=zh-CN`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(1800);
  const bodyText = await grabBodyText(page);
  const needHuman = looksLikeHumanIntervention(bodyText, page.url());
  const shot = await makeScreenshot(page, "google");

  const results = await page.evaluate(() => {
    const links = [];
    const seen = new Set();
    const h3List = Array.from(document.querySelectorAll("a h3"));
    for (const h3 of h3List) {
      const a = h3.closest("a");
      if (!a) continue;
      const title = (h3.textContent || "").trim();
      const url = (a.href || "").trim();
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);
      links.push({ title, url });
      if (links.length >= 8) break;
    }
    return links;
  });

  const top = compactList(results, 5);
  const lines = top.length
    ? top.map((r, idx) => `${idx + 1}. ${r.title} (${r.url})`).join("\n")
    : "未提取到搜索结果，可能页面需要人工验证。";

  return toResult({
    success: !needHuman,
    exit_code: needHuman ? 2 : 0,
    screenshot: shot.base64,
    message: needHuman
      ? `Google 页面触发验证或登录，请人工接管后重试。\n当前关键词：${query}`
      : `Google 搜索完成，关键词：${query}\n${lines}`,
    meta: {
      site: "google",
      action: "search",
      query,
      results: top,
      requires_human: needHuman,
      screenshot_path: shot.filePath,
      task,
    },
  });
}

async function runZhihuFollow(page, task, parsed) {
  const query = parsed.query || "";
  if (query) {
    const u = `https://www.zhihu.com/search?type=people&q=${encodeURIComponent(query)}`;
    await page.goto(u, { waitUntil: "domcontentloaded" });
  } else {
    await page.goto("https://www.zhihu.com/follow", { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(2200);
  const bodyText = await grabBodyText(page, 5000);
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
      if (out.length >= 12) break;
    }
    return out;
  });

  const top = compactList(people, 8);
  if (query && top.length) {
    try {
      await page.goto(top[0].url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
    } catch (_err) {
      // ignore navigation failure
    }
  }

  const shot = await makeScreenshot(page, "zhihu");
  const listText = top.length
    ? top.slice(0, 5).map((p, idx) => `${idx + 1}. ${p.name} (${p.url})`).join("\n")
    : "未提取到博主列表，可能需要登录后访问。";

  return toResult({
    success: !needHuman,
    exit_code: needHuman ? 2 : 0,
    screenshot: shot.base64,
    message: needHuman
      ? "知乎页面需要登录或验证，请你手动处理后再继续。"
      : (query
        ? `知乎博主检索完成，关键词：${query}\n${listText}`
        : `知乎关注页抓取完成\n${listText}`),
    meta: {
      site: "zhihu",
      action: parsed.action,
      query,
      people: top,
      requires_human: needHuman,
      screenshot_path: shot.filePath,
      task,
    },
  });
}

async function runZhihuSearch(page, task, parsed) {
  const query = parsed.query || "";
  if (!query) {
    return toResult({
      success: false,
      exit_code: 1,
      message: "知乎搜索缺少关键词，例如：在知乎搜索 AI 自动化",
      meta: { parsed },
    });
  }

  const u = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(query)}`;
  await page.goto(u, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);

  const bodyText = await grabBodyText(page, 5000);
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
      if (out.length >= 10) break;
    }
    return out;
  });

  const top = compactList(items, 5);
  const shot = await makeScreenshot(page, "zhihu-search");
  const listText = top.length
    ? top.map((r, idx) => `${idx + 1}. ${r.title} (${r.url})`).join("\n")
    : "未提取到搜索结果，可能页面需要人工验证。";

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
      task,
    },
  });
}

async function runZhihuLatestAnswer(page, task, parsed) {
  const creator = cleanCreatorName(parsed.creator || "");
  if (!creator) {
    return toResult({
      success: false,
      exit_code: 1,
      message: "缺少博主名称，例如：帮我看看知乎 DeepVan 这个博主的最新回答",
      meta: { parsed, task },
    });
  }

  const searchUrl = `https://www.zhihu.com/search?type=people&q=${encodeURIComponent(creator)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);

  const bodyText = await grabBodyText(page, 5000);
  const needHumanOnSearch = looksLikeHumanIntervention(bodyText, page.url());
  if (needHumanOnSearch) {
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
        task,
      },
    });
  }

  const people = await page.evaluate(() => {
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
      if (out.length >= 20) break;
    }
    return out;
  });

  const exact = people.find((p) => sameName(p.name, creator));
  if (!exact) {
    const shot = await makeScreenshot(page, "zhihu-latest-answer-notfound");
    return toResult({
      success: false,
      exit_code: 4,
      screenshot: shot.base64,
      message: `未精确匹配到博主“${creator}”，请确认账号名称。`,
      meta: {
        site: "zhihu",
        action: "latest_answer",
        creator,
        candidates: compactList(people, 8),
        requires_human: false,
        screenshot_path: shot.filePath,
        task,
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
      // keep fallback evaluate below
    }
  }

  const answerPageText = await grabBodyText(page, 6000);
  const needHumanOnAnswerPage = looksLikeHumanIntervention(answerPageText, page.url());
  if (needHumanOnAnswerPage) {
    const shot = await makeScreenshot(page, "zhihu-latest-answer-login2");
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
        task,
      },
    });
  }

  const latest = await page.evaluate(() => {
    const first = document.querySelector('a[href*="/question/"][href*="/answer/"]');
    if (!first) return null;
    const title = (first.textContent || "").trim().replace(/\s+/g, " ");
    const url = (first.href || "").trim();
    const card =
      first.closest(".List-item") ||
      first.closest(".ContentItem") ||
      first.closest(".AnswerItem") ||
      first.parentElement;
    const t =
      card?.querySelector("time")?.getAttribute("datetime") ||
      card?.querySelector("time")?.textContent ||
      "";
    const text = (card?.innerText || title || "").replace(/\s+/g, " ").trim();
    const snippet = text.length > 260 ? `${text.slice(0, 260)}...` : text;
    return { title, url, time: String(t).trim(), snippet };
  });

  const shot = await makeScreenshot(page, "zhihu-latest-answer");
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
        task,
      },
    });
  }

  let detail = null;
  try {
    await page.goto(latest.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
    detail = await page.evaluate(() => {
      const t =
        document.querySelector("time")?.getAttribute("datetime") ||
        document.querySelector("time")?.textContent ||
        "";
      const paragraphs = Array.from(document.querySelectorAll(".RichText p, .RichText span, p"))
        .map((x) => (x.textContent || "").trim())
        .filter(Boolean)
        .filter((x) => x.length > 3);
      const summary = paragraphs.slice(0, 3).join(" ");
      return { time: String(t).trim(), summary };
    });
  } catch (_err) {
    // keep list-page extraction as fallback
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
      task,
    },
  });
}

async function runXhsSearch(page, task, parsed) {
  const query = parsed.query || "";
  if (!query) {
    return toResult({
      success: false,
      exit_code: 1,
      message: "小红书搜索缺少关键词，例如：小红书搜索 OpenClaw",
      meta: { parsed },
    });
  }

  const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const bodyText = await grabBodyText(page, 6000);
  const needHuman = looksLikeHumanIntervention(bodyText, page.url());

  const items = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('a[href*="/explore/"]'));
    for (const a of links) {
      const href = a.href || "";
      if (!href || seen.has(href)) continue;
      const title = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!title) continue;
      seen.add(href);
      out.push({ title, url: href });
      if (out.length >= 12) break;
    }
    return out;
  });

  const top = compactList(items, 5);
  const shot = await makeScreenshot(page, "xhs-search");
  const listText = top.length
    ? top.map((r, idx) => `${idx + 1}. ${r.title} (${r.url})`).join("\n")
    : "未提取到笔记列表，可能需要登录。";

  return toResult({
    success: !needHuman,
    exit_code: needHuman ? 2 : 0,
    screenshot: shot.base64,
    message: needHuman
      ? `小红书页面需要登录或验证，请人工接管后重试。\n当前关键词：${query}`
      : `小红书搜索完成，关键词：${query}\n${listText}`,
    meta: {
      site: "xiaohongshu",
      action: "search_notes",
      query,
      results: top,
      requires_human: needHuman,
      screenshot_path: shot.filePath,
      task,
    },
  });
}

async function fillContentEditable(locator, text) {
  await locator.click({ timeout: 2000 });
  await locator.fill("");
  await locator.type(text, { delay: 8 });
}

async function runXhsPublish(page, task, parsed) {
  const payload = parsed.payload || {};
  await page.goto("https://creator.xiaohongshu.com/publish/publish", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const bodyText = await grabBodyText(page, 8000);
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
      const titleInput = page
        .locator('input[placeholder*="标题"], textarea[placeholder*="标题"]')
        .first();
      await titleInput.fill(payload.title, { timeout: 3000 });
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
      await textArea.fill(payload.content, { timeout: 3000 });
      steps.push("已填写正文");
      filled = true;
    } catch (_err) {
      // try content editable
    }

    if (!filled) {
      try {
        const editable = page.locator('[contenteditable="true"]').first();
        await fillContentEditable(editable, payload.content);
        steps.push("已填写正文(contenteditable)");
        filled = true;
      } catch (_err) {
        steps.push("未找到正文输入框");
      }
    }
  }

  let published = false;
  const allowPublish = process.env.WEB_PUBLISH_CONFIRM === "1" || payload.shouldPublish;
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
  const msgTail = steps.length ? `\n步骤：${steps.join("；")}` : "";

  if (needHuman) {
    return toResult({
      success: false,
      exit_code: 2,
      screenshot: shot.base64,
      message: "小红书发布页需要登录或验证，请先手动处理。" + msgTail,
      meta: {
        site: "xiaohongshu",
        action: "publish_note",
        payload,
        published,
        requires_human: true,
        screenshot_path: shot.filePath,
        task,
      },
    });
  }

  return toResult({
    success: true,
    exit_code: 0,
    screenshot: shot.base64,
    message: published
      ? "小红书发布流程已执行（已点击发布）。"
      : "小红书发布草稿准备完成，请人工确认后发布。" + msgTail,
    meta: {
      site: "xiaohongshu",
      action: "publish_note",
      payload,
      published,
      requires_human: !published,
      screenshot_path: shot.filePath,
      task,
    },
  });
}

async function connectBrowser(cdpUrl) {
  const { chromium } = require("playwright");
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  return { browser, context };
}

const AUTO_TAB_NAME = "__OPEN_AUTOGLM_WEB_AUTOMATION__";

function isManagedUrl(url) {
  const u = String(url || "");
  return (
    u.startsWith("about:blank") ||
    u.includes("google.com") ||
    u.includes("zhihu.com") ||
    u.includes("xiaohongshu.com") ||
    u.includes("creator.xiaohongshu.com")
  );
}

async function getAutomationPage(context) {
  const maxTabs = Number(process.env.WEB_MAX_DOMAIN_TABS || 2);
  const cleanupManaged = async (limit) => {
    const allPages = context.pages();
    const managed = allPages.filter((p) => isManagedUrl(p.url()));
    if (managed.length > limit) {
      const toClose = managed.slice(0, managed.length - limit);
      for (const p of toClose) {
        try {
          await p.close();
        } catch (_err) {
          // ignore
        }
      }
    }
  };

  await cleanupManaged(maxTabs);

  const pages = context.pages();
  const owned = [];
  for (const p of pages) {
    try {
      const wn = await p.evaluate(() => window.name);
      if (wn === AUTO_TAB_NAME) owned.push(p);
    } catch (_err) {
      // ignore pages that cannot be evaluated
    }
  }

  // keep only one owned tab to avoid unlimited tab growth
  if (owned.length > 1) {
    for (let i = 0; i < owned.length - 1; i += 1) {
      try {
        await owned[i].close();
      } catch (_err) {
        // ignore
      }
    }
  }

  const keep = owned[owned.length - 1];
  if (keep) return keep;

  await cleanupManaged(Math.max(0, maxTabs - 1));
  const page = await context.newPage();
  await page.goto("about:blank");
  await page.evaluate((name) => {
    window.name = name;
  }, AUTO_TAB_NAME);
  return page;
}

async function runWebTask(rawTask, opts = {}) {
  const task = normalizeTask(rawTask);
  const parsed = parseTask(task);

  if (!task) {
    return toResult({
      success: false,
      exit_code: 1,
      message: "任务为空，请输入自然语言指令。",
      meta: { parsed },
    });
  }

  if (parsed.site === "unknown") {
    return toResult({
      success: false,
      exit_code: 3,
      message: "未识别为网页任务，请包含关键词：Google/知乎/小红书。",
      meta: { parsed, task },
    });
  }

  const cdpUrl = opts.cdpUrl || process.env.WEB_CDP_URL || "http://127.0.0.1:9222";
  // Default: keep the opened page for human takeover/login.
  // Set WEB_KEEP_OPEN=0 to auto-close page and browser connection at the end.
  const keepOpenByEnv = process.env.WEB_KEEP_OPEN !== "0";
  let browser;
  let page;
  let result;

  try {
    const { browser: b, context } = await connectBrowser(cdpUrl);
    browser = b;
    page = await getAutomationPage(context);
    page.setDefaultTimeout(15000);

    if (parsed.site === "google" && parsed.action === "search") {
      result = await runGoogleSearch(page, task, parsed);
      return result;
    }

    if (parsed.site === "zhihu" && parsed.action === "follow_lookup") {
      result = await runZhihuFollow(page, task, parsed);
      return result;
    }

    if (parsed.site === "zhihu" && parsed.action === "search") {
      result = await runZhihuSearch(page, task, parsed);
      return result;
    }

    if (parsed.site === "zhihu" && parsed.action === "latest_answer") {
      result = await runZhihuLatestAnswer(page, task, parsed);
      return result;
    }

    if (parsed.site === "xiaohongshu" && parsed.action === "search_notes") {
      result = await runXhsSearch(page, task, parsed);
      return result;
    }

    if (parsed.site === "xiaohongshu" && parsed.action === "publish_note") {
      result = await runXhsPublish(page, task, parsed);
      return result;
    }

    result = toResult({
      success: false,
      exit_code: 3,
      message: `未实现的任务类型: ${parsed.site}/${parsed.action}`,
      meta: { parsed, task },
    });
    return result;
  } catch (err) {
    result = toResult({
      success: false,
      exit_code: 1,
      message: `网页自动化执行失败: ${err.message}`,
      meta: { parsed, task, cdpUrl, error: String(err) },
    });
    return result;
  } finally {
    const keepOpenForHuman =
      keepOpenByEnv || Boolean(result && result.meta && result.meta.requires_human);

    if (page && !keepOpenForHuman) {
      try {
        await page.close();
      } catch (_err) {
        // ignore
      }
    }
    if (browser) {
      try {
        if (!keepOpenForHuman) {
          await browser.close();
        }
      } catch (_err) {
        // ignore
      }
    }
  }
}

module.exports = {
  parseTask,
  runWebTask,
};
