"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { isManagedUrl: isManagedUrlFromLearning } = require("../learning/system");

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
  const dir = path.join(os.tmpdir(), "open-web-automation-shots");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function makeScreenshot(page, label) {
  if (process.env.WEB_NO_SCREENSHOT === "1") {
    return { filePath: "", base64: "" };
  }
  const dir = ensureScreenshotDir();
  const fileName = `${Date.now()}-${label}.jpg`;
  const filePath = path.join(dir, fileName);
  // Use JPEG with low quality for vision model (viewport only, not fullPage)
  await page.screenshot({ path: filePath, fullPage: false, type: 'jpeg', quality: 20 });
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

async function connectBrowser(cdpUrl) {
  const { chromium } = require("playwright");
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  return { browser, context };
}

const AUTO_TAB_NAME = "__OPEN_WEB_AUTOMATION__";
const HUMAN_TAB_PREFIX = "__OPEN_WEB_AUTOMATION_HUMAN__";

function isManagedUrl(url) {
  // 使用学习系统
  return isManagedUrlFromLearning(url);
}

async function readWindowNameSafe(page) {
  try {
    return await page.evaluate(() => window.name);
  } catch (_err) {
    return "";
  }
}

async function tagAutomationPage(page) {
  try {
    await page.evaluate((name) => {
      window.name = name;
    }, AUTO_TAB_NAME);
  } catch (_err) {
    // ignore
  }
}

function isHumanLockedName(name) {
  return String(name || "").startsWith(HUMAN_TAB_PREFIX);
}

async function markHumanPauseTab(page) {
  try {
    await page.evaluate((name) => {
      window.name = name;
    }, `${HUMAN_TAB_PREFIX}${Date.now()}`);
  } catch (_err) {
    // ignore
  }
}

async function closePagesSafe(pages) {
  for (const p of pages) {
    try {
      if (!p.isClosed()) await p.close();
    } catch (_err) {
      // ignore
    }
  }
}

async function getAutomationPage(context) {
  const maxTabs = Math.max(1, Number(process.env.WEB_MAX_DOMAIN_TABS || 2));
  const pages = context.pages();

  const infos = [];
  for (const p of pages) {
    const info = { page: p, url: "", name: "" };
    try {
      info.url = p.url() || "";
    } catch (_err) {
      // ignore
    }
    info.name = await readWindowNameSafe(p);
    infos.push(info);
  }

  const owned = infos.filter((i) => i.name === AUTO_TAB_NAME);
  const managed = infos.filter((i) => isManagedUrl(i.url) && !isHumanLockedName(i.name));
  const keepInfo = owned[owned.length - 1] || managed[managed.length - 1] || null;

  if (keepInfo) {
    await tagAutomationPage(keepInfo.page);
  }

  if (owned.length > 1) {
    const extraOwned = owned
      .slice(0, owned.length - 1)
      .map((i) => i.page)
      .filter((p) => !keepInfo || p !== keepInfo.page);
    await closePagesSafe(extraOwned);
  }

  if (managed.length > maxTabs) {
    const closableManaged = managed
      .map((i) => i.page)
      .filter((p) => !keepInfo || p !== keepInfo.page);
    const needClose = managed.length - maxTabs;
    await closePagesSafe(closableManaged.slice(0, needClose));
  }

  const stale = infos
    .filter((i) => {
      if (isHumanLockedName(i.name)) return false;
      if (keepInfo && i.page === keepInfo.page) return false;
      const u = i.url || "";
      return u.startsWith("about:blank") || u.startsWith("chrome://newtab") || u.startsWith("chrome-error://");
    })
    .map((i) => i.page);
  await closePagesSafe(stale);

  if (keepInfo && !keepInfo.page.isClosed()) {
    return keepInfo.page;
  }

  const page = await context.newPage();
  await page.goto("about:blank");
  await tagAutomationPage(page);
  return page;
}

module.exports = {
  safeClickByText,
  grabBodyText,
  makeScreenshot,
  compactList,
  sameName,
  connectBrowser,
  getAutomationPage,
  markHumanPauseTab,
};
