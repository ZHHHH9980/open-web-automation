"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const { getRuntimeBrowserConfig } = require("../../../config/browser-config");

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
      isLocal: ["127.0.0.1", "localhost"].includes(url.hostname),
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
    "--no-default-browser-check",
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
        body: Buffer.concat(chunks).toString("utf8"),
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
    stdio: "ignore",
  });
  child.unref();

  const ready = await waitForCdpReady(runtimeConfig.cdpUrl, 20000);
  if (!ready) {
    throw new Error(
      `Chrome 已尝试启动，但 CDP 未在 20 秒内就绪：${runtimeConfig.cdpUrl}。`
      + " 可手动运行 ./start-chrome.sh，或检查 automation-web/config/browser.json。"
    );
  }

  if (opts.onStatus) {
    opts.onStatus(`Chrome 已就绪，CDP: ${runtimeConfig.cdpUrl}`);
  }

  return {
    attempted: true,
    runtimeConfig,
    pid: child.pid,
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
      onStatus: opts.onStatus,
    });

    if (!launchResult.attempted) {
      const reason = launchResult.reason || "unknown";
      throw new Error(
        `browserType.connectOverCDP failed: ${err.message}. `
        + `自动启动未执行（${reason}）。可先运行 ./start-chrome.sh，或配置 automation-web/config/browser.json。`
      );
    }

    return await connect();
  }
}

module.exports = {
  connectBrowser,
  __internal: {
    sleep,
    isConnectionRefused,
    parseCdpEndpoint,
    buildChromeLaunchArgs,
    httpGet,
    waitForCdpReady,
    autoLaunchBrowser,
  },
};
