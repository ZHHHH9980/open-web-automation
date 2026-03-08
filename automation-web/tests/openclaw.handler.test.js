#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  createOpenClawWebAutomationHandler,
  buildTaskInput,
  buildResponseEnvelope,
} = require("../adapters/openclaw/handler");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("buildTaskInput reads request.input first", () => {
  const input = buildTaskInput({
    task_id: "task_123",
    prompt: "外层 prompt",
    input: {
      prompt: "内层 prompt",
      timeout_ms: 180000,
      keep_open_on_human: false,
    },
  });

  assert.deepStrictEqual(input, {
    task_id: "task_123",
    prompt: "内层 prompt",
    timeout_ms: 180000,
    max_steps: undefined,
    debug_mode: undefined,
    cdp_url: undefined,
    keep_open: undefined,
    keep_open_on_human: false,
  });
});

test("buildResponseEnvelope wraps mapped result", () => {
  const envelope = buildResponseEnvelope({
    task_id: "task_456",
    capability: "web_automation.run",
  }, {
    status: "completed",
    success: true,
    task_id: "task_456",
  });

  assert.deepStrictEqual(envelope, {
    task_id: "task_456",
    capability: "web_automation.run",
    status: "completed",
    success: true,
    result: {
      status: "completed",
      success: true,
      task_id: "task_456",
    },
  });
});

test("createOpenClawWebAutomationHandler executes runner", async () => {
  const handle = createOpenClawWebAutomationHandler({
    runOpenClawTask: async (input) => ({
      task_id: input.task_id,
      status: "waiting_human",
      success: false,
      requires_human: true,
      summary: "需要登录",
    }),
  });

  const response = await handle({
    task_id: "task_789",
    capability: "web_automation.run",
    input: {
      prompt: "去小红书搜索 openclaw",
    },
  });

  assert.strictEqual(response.task_id, "task_789");
  assert.strictEqual(response.capability, "web_automation.run");
  assert.strictEqual(response.status, "waiting_human");
  assert.strictEqual(response.result.summary, "需要登录");
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
