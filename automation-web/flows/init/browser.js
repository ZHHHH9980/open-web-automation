"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const { getRuntimeBrowserConfig } = require("../../config/browser-config");
const { getOutputDir } = require("../../shared/utils");

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
  const dir = path.join(getOutputDir(), "screenshots");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConnectionRefused(err) {
  const msg = String(err && (err.message || err));
  return msg.includes("ECONNREFUSED") || msg.includes("connect ECONNREFUSED");
}

function parseCdpEndpoint(cdpUrl) {
  try {
    const url = new URL(cdpUrl);
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    return {
      url,
      hostname: url.hostname,
      port,
      isLocal: ["127.0.0.1", "localhost"].includes(url.hostname)
    };
  } catch (_err) {
    return null;
  }
}

function buildChromeLaunchArgs(runtimeConfig) {
  const endpoint = parseCdpEndpoint(runtimeConfig.cdpUrl);
  if (!endpoint) {
    throw new Error(`invalid CDP url: ${runtimeConfig.cdpUrl}`);
  }

  const args = [
    `--remote-debugging-port=${endpoint.port}`,
    "--no-first-run",
    "--no-default-browser-check"
  ];

  if (runtimeConfig.profilePath) {
    args.push(`--user-data-dir=${path.dirname(runtimeConfig.profilePath)}`);
    args.push(`--profile-directory=${path.basename(runtimeConfig.profilePath)}`);
  }

  return args;
}

function httpGet(urlString, timeoutMs = 1500) {
  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        statusCode: res.statusCode || 0,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
  });
}

async function waitForCdpReady(cdpUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const versionUrl = new URL("/json/version", cdpUrl).toString();

  while (Date.now() < deadline) {
    try {
      const res = await httpGet(versionUrl, 1000);
      if (res.statusCode >= 200 && res.statusCode < 500) {
        return true;
      }
    } catch (_err) {
      // keep polling
    }
    await sleep(500);
  }

  return false;
}

async function autoLaunchBrowser(cdpUrl, opts = {}) {
  const runtimeConfig = getRuntimeBrowserConfig(cdpUrl);
  const endpoint = parseCdpEndpoint(runtimeConfig.cdpUrl);
  const disabled = process.env.WEB_CDP_AUTO_LAUNCH === "0";

  if (disabled) {
    return { attempted: false, reason: "disabled" };
  }
  if (!endpoint || !endpoint.isLocal) {
    return { attempted: false, reason: "non-local-cdp" };
  }
  if (!runtimeConfig.chromePath) {
    return { attempted: false, reason: "missing-chrome-path" };
  }
  if (!fs.existsSync(runtimeConfig.chromePath)) {
    return { attempted: false, reason: "chrome-not-found" };
  }

  const args = buildChromeLaunchArgs(runtimeConfig);
  if (opts.onStatus) {
    opts.onStatus(`CDP 未启动，自动拉起 Chrome: ${runtimeConfig.chromePath}`);
  }

  const child = spawn(runtimeConfig.chromePath, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  const ready = await waitForCdpReady(runtimeConfig.cdpUrl, 20000);
  if (!ready) {
    throw new Error(
      `Chrome 已尝试启动，但 CDP 未在 20 秒内就绪：${runtimeConfig.cdpUrl}。` +
      ` 可手动运行 ./start-chrome.sh，或检查 automation-web/config/browser.json。`
    );
  }

  if (opts.onStatus) {
    opts.onStatus(`Chrome 已就绪，CDP: ${runtimeConfig.cdpUrl}`);
  }

  return {
    attempted: true,
    runtimeConfig,
    pid: child.pid
  };
}

async function connectBrowser(cdpUrl, opts = {}) {
  const { chromium } = require("playwright");
  const targetCdpUrl = getRuntimeBrowserConfig(cdpUrl).cdpUrl;

  async function connect() {
    const browser = await chromium.connectOverCDP(targetCdpUrl);
    const contexts = browser.contexts();
    const context = contexts[0] || (await browser.newContext());
    return { browser, context };
  }

  try {
    return await connect();
  } catch (err) {
    if (!isConnectionRefused(err)) {
      throw err;
    }

    const launchResult = await autoLaunchBrowser(targetCdpUrl, {
      onStatus: opts.onStatus
    });

    if (!launchResult.attempted) {
      const reason = launchResult.reason || "unknown";
      throw new Error(
        `browserType.connectOverCDP failed: ${err.message}. ` +
        `自动启动未执行（${reason}）。可先运行 ./start-chrome.sh，或配置 automation-web/config/browser.json。`
      );
    }

    return await connect();
  }
}

const AUTO_TAB_NAME = "__OPEN_WEB_AUTOMATION__";
const HUMAN_TAB_PREFIX = "__OPEN_WEB_AUTOMATION_HUMAN__";

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
  const keepInfo = owned[owned.length - 1] || null;

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
