#!/usr/bin/env node

const { runWebTask } = require("./automation-web/executor");

async function main() {
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    const out = {
      success: false,
      message: "任务为空",
      has_screenshot: false,
      screenshot: "",
      exit_code: 1,
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(`${JSON.stringify(out)}\n`);
    process.exitCode = 1;
    return;
  }

  const result = await runWebTask(task);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  const code = result.exit_code || (result.success ? 0 : 1);
  process.exit(code);
}

main().catch((err) => {
  const out = {
    success: false,
    message: `统一执行器异常: ${err.message}`,
    has_screenshot: false,
    screenshot: "",
    exit_code: 1,
    timestamp: new Date().toISOString(),
    meta: { error: String(err) },
  };
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(1);
});
