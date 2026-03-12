"use strict";

const { data: dataHandler, listen: listenHandler } = require("./actions");

function appendHistory(history, { step, action, reason, note, url }) {
  history.push({
    step,
    action,
    reason,
    note,
    url,
  });
}

function appendErrorHistory(history, { step, action, reason, error, url }) {
  history.push({
    step,
    action,
    reason,
    error,
    url,
  });
}

function handlePostActionEffects({
  decision,
  execRet,
  executionContext,
  progress,
  extractionFile,
  extractedCount,
  debug,
}) {
  let nextExtractedCount = extractedCount;

  if (decision.action === "listen" && execRet.apiCollector) {
    listenHandler.handleApiListener(executionContext, execRet.apiCollector, progress);
  }

  if (["scrape_list", "select_list", "scrape_detail"].includes(decision.action) && execRet.data) {
    if (["scrape_list", "select_list"].includes(decision.action)) {
      executionContext.lastListCapture = execRet.data;
    }

    if (decision.capture !== false) {
      nextExtractedCount += 1;
      dataHandler.storeCapturedData(extractionFile, nextExtractedCount, decision.action, execRet.data, debug);
    }
  }

  return {
    extractedCount: nextExtractedCount,
  };
}

module.exports = {
  handlePostActionEffects,
  appendHistory,
  appendErrorHistory,
};
