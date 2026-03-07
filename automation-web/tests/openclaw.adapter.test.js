#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { mapOpenClawResult, normalizeInput, runOpenClawTask } = require("../adapters/openclaw");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("normalizeInput maps snake_case fields", () => {
  const input = normalizeInput({
    task_id: "task_123",
    prompt: "  去知乎看看热榜  ",
    timeout_ms: 180000,
    max_steps: 20,
    debug_mode: true,
    cdp_url: "http://127.0.0.1:9222",
    keep_open_on_human: false,
  });

  assert.deepStrictEqual(input, {
    taskId: "task_123",
    prompt: "去知乎看看热榜",
    timeoutMs: 180000,
    maxSteps: 20,
    debugMode: true,
    cdpUrl: "http://127.0.0.1:9222",
    keepOpen: undefined,
    keepOpenOnHuman: false,
  });
});

test("mapOpenClawResult maps waiting_human payload", () => {
  const mapped = mapOpenClawResult({
    success: false,
    message: "login required",
    has_screenshot: true,
    screenshot: "base64-data",
    exit_code: 2,
    meta: {
      requires_human: true,
      screenshot_path: "/tmp/login.jpg",
      retry_hint: "请完成登录后重试",
      url: "https://example.com/login",
    },
  }, { taskId: "task_456", outputFile: "/tmp/result.md" });

  assert.strictEqual(mapped.task_id, "task_456");
  assert.strictEqual(mapped.status, "waiting_human");
  assert.strictEqual(mapped.requires_human, true);
  assert.strictEqual(mapped.summary, "login required");
  assert.strictEqual(mapped.screenshot.path, "/tmp/login.jpg");
  assert.deepStrictEqual(mapped.artifact_files, ["/tmp/result.md", "/tmp/login.jpg"]);
});

test("runOpenClawTask returns mapped result with artifact", async () => {
  const result = await runOpenClawTask({ task_id: "task_789", prompt: "测试任务" }, {
    runAgentTask: async () => ({
      success: true,
      message: "task completed",
      has_screenshot: false,
      screenshot: "",
      exit_code: 0,
      meta: {
        requires_human: false,
        conclusion: { summary: "已整理 3 条结果" },
        url: "https://example.com/result",
      },
    }),
    saveExtractedContent: () => "/tmp/output.md",
  });

  assert.strictEqual(result.task_id, "task_789");
  assert.strictEqual(result.status, "completed");
  assert.strictEqual(result.summary, "已整理 3 条结果");
  assert.deepStrictEqual(result.artifacts, [
    { kind: "report", type: "markdown", path: "/tmp/output.md" },
  ]);
});

(async () => {
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      throw error;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
