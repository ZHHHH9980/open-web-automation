"use strict";

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
      const url = i.url || "";
      return url.startsWith("about:blank") || url.startsWith("chrome://newtab") || url.startsWith("chrome-error://");
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
  getAutomationPage,
  markHumanPauseTab,
  __internal: {
    readWindowNameSafe,
    tagAutomationPage,
    isHumanLockedName,
    closePagesSafe,
    AUTO_TAB_NAME,
    HUMAN_TAB_PREFIX,
  },
};
