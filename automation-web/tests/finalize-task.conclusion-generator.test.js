#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { finalizeCompletedTask } = require("../flows/finish/finalize-task");

async function main() {
  const page = { url() { return "https://www.zhihu.com/people/Khazix/posts"; } };
  const result = await finalizeCompletedTask({
    page,
    task: "test task",
    taskAnalysis: { intent: "search" },
    execRet: { success: true, requiresHuman: false, result: "ok", data: {} },
    history: [],
    extractedCount: 0,
    extractionFile: "",
    model: null,
    opts: {},
    progress: false,
  });

  assert.equal(result.meta.conclusion, null);
  assert.equal(result.meta.conclusion_generator, null);
  console.log("✓ exposes conclusion_generator in meta");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
