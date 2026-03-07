#!/usr/bin/env node

"use strict";

const { runAgentTask } = require("./flows/orchestrator");
const { saveExtractedContent } = require("./result-output/save-extracted-content");
const { normalizeInlineText, formatTimestamp } = require("./result-output/text-format");
const {
  compactInteraction,
  renderStructuredItems,
  renderCaptureEntry,
  renderDetailItem,
  renderListItem,
} = require("./result-output/render-capture");

function writeJsonLine(obj) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const opts = {};
    const taskParts = [];

    for (const arg of args) {
      if (arg.startsWith("--debug-mode=")) {
        opts.debugMode = arg.split("=")[1] === "true";
      } else {
        taskParts.push(arg);
      }
    }

    const input = taskParts.join(" ");
    const result = await runAgentTask(input, opts);

    const outputFile = saveExtractedContent(result);
    if (outputFile) {
      process.stderr.write(`\n✓ 内容已保存到: ${outputFile}\n\n`);
    }

    await writeJsonLine(result);
    process.exitCode = result.exit_code || (result.success ? 0 : 1);
  } catch (err) {
    await writeJsonLine({
      success: false,
      message: `agent runtime exception: ${err.message || err}`,
      has_screenshot: false,
      screenshot: "",
      exit_code: 1,
      timestamp: new Date().toISOString(),
      meta: { error: String(err), requires_human: false },
    });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  saveExtractedContent,
  __internal: {
    renderStructuredItems,
    renderCaptureEntry,
    renderDetailItem,
    renderListItem,
    formatTimestamp,
    compactInteraction,
  },
};
