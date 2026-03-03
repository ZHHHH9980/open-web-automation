#!/usr/bin/env node

const { runWebTask } = require("./engine");

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
    const result = await runWebTask(input);
    await writeJsonLine(result);
    process.exitCode = result.exit_code || (result.success ? 0 : 1);
  } catch (err) {
    const out = {
      success: false,
      message: `执行异常: ${err.message}`,
      has_screenshot: false,
      screenshot: "",
      exit_code: 1,
      timestamp: new Date().toISOString(),
      meta: { error: String(err) },
    };
    await writeJsonLine(out);
    process.exitCode = 1;
  }
})();
