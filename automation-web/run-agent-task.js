#!/usr/bin/env node

"use strict";

const { runAgentTask } = require("./llm-agent");

function writeJsonLine(obj) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

(async () => {
  try {
    const input = process.argv.slice(2).join(" ");
    const result = await runAgentTask(input);
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
})();
