"use strict";

const { getSiteConfig } = require("./site-config");

async function detectHumanBlock(page, url) {
  const siteConfig = getSiteConfig(url || "");
  const selector = siteConfig?.selectors?.login_modal || "";
  if (!selector) {
    return null;
  }

  try {
    const locator = page.locator(selector).first();
    const visible = await locator.isVisible({ timeout: 500 });
    if (!visible) {
      return null;
    }

    let text = "";
    try {
      text = String(await locator.innerText({ timeout: 1000 }) || "").replace(/\s+/g, " ").trim().slice(0, 200);
    } catch (_err) {
      // ignore
    }

    return {
      type: "login_modal",
      selector,
      text,
      reason: text ? `login modal detected: ${text}` : "login modal detected",
    };
  } catch (_err) {
    return null;
  }
}

/**
 * Start collecting API responses (call before navigation)
 */
function startApiCollection(page) {
  const apiData = [];

  const responseHandler = async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    if (contentType.includes("application/json")) {
      try {
        const json = await response.json();
        const dataSize = JSON.stringify(json).length;

        if (dataSize > 1000) {
          apiData.push({
            url,
            status: response.status(),
            method: response.request().method(),
            data: json,
            dataSize,
            timestamp: Date.now(),
          });
        }
      } catch (_err) {
        // ignore parse errors
      }
    }
  };

  page.on("response", responseHandler);

  return {
    stop: () => {
      page.off("response", responseHandler);
      return apiData;
    },
    getData: () => apiData,
  };
}

/**
 * Collect API-first page state for planner
 */
async function collectPageState(page, step, _candidateLimit, apiCollector = null) {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
  } catch (_err) {
    // ignore timeout
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const url = page.url();
  const title = await page.title().catch(() => "");
  const apiResponses = apiCollector ? apiCollector.getData() : [];
  const humanBlock = await detectHumanBlock(page, url);

  return {
    step,
    url,
    title,
    api_responses: apiResponses,
    human_block: humanBlock,
  };
}

module.exports = { collectPageState, startApiCollection };
