"use strict";

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

  return {
    step,
    url,
    title,
    api_responses: apiResponses,
  };
}

module.exports = { collectPageState, startApiCollection };
