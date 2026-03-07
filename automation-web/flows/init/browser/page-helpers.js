"use strict";

const fs = require("fs");
const path = require("path");
const { getOutputDir } = require("../../../shared/utils");

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
  await page.screenshot({ path: filePath, fullPage: false, type: "jpeg", quality: 20 });
  const base64 = fs.readFileSync(filePath).toString("base64");
  return { filePath, base64 };
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

module.exports = {
  safeClickByText,
  grabBodyText,
  makeScreenshot,
  compactList,
  sameName,
};
