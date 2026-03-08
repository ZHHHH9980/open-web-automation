"use strict";

const { createOpenClawWebAutomationHandler } = require("./handler");

const handleWebAutomation = createOpenClawWebAutomationHandler();

async function example() {
  const request = {
    task_id: "task_123",
    capability: "web_automation.run",
    input: {
      prompt: "去知乎搜索 AI Agent，返回前 5 条结果",
      timeout_ms: 180000,
    },
  };

  const response = await handleWebAutomation(request);
  console.log(JSON.stringify(response, null, 2));
}

if (require.main === module) {
  example().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
