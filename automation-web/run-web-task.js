#!/usr/bin/env node

const { runWebTask } = require("./executor");

async function main() {
  const task = process.argv.slice(2).join(" ").trim();
  const result = await runWebTask(task);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  const code = result.exit_code || (result.success ? 0 : 1);
  process.exit(code);
}

main().catch((err) => {
  const result = {
    success: false,
    message: `执行异常: ${err.message}`,
    has_screenshot: false,
    screenshot: "",
    exit_code: 1,
    timestamp: new Date().toISOString(),
    meta: { error: String(err) },
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(1);
});
