"use strict";

const { runOpenClawTask } = require("./index");
const { normalizeText } = require("../../shared/utils");

function pickFirst(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string") {
      const normalized = normalizeText(value);
      if (normalized) return normalized;
      continue;
    }
    return value;
  }
  return undefined;
}

function buildTaskInput(request = {}) {
  const input = request.input && typeof request.input === "object" ? request.input : {};

  return {
    task_id: pickFirst(request.task_id, request.taskId, input.task_id, input.taskId),
    prompt: pickFirst(input.prompt, input.task, request.prompt, request.task),
    timeout_ms: pickFirst(input.timeout_ms, input.timeoutMs, request.timeout_ms, request.timeoutMs),
    max_steps: pickFirst(input.max_steps, input.maxSteps, request.max_steps, request.maxSteps),
    debug_mode: pickFirst(input.debug_mode, input.debugMode, request.debug_mode, request.debugMode),
    cdp_url: pickFirst(input.cdp_url, input.cdpUrl, request.cdp_url, request.cdpUrl),
    keep_open: pickFirst(input.keep_open, input.keepOpen, request.keep_open, request.keepOpen),
    keep_open_on_human: pickFirst(
      input.keep_open_on_human,
      input.keepOpenOnHuman,
      request.keep_open_on_human,
      request.keepOpenOnHuman,
    ),
  };
}

function buildResponseEnvelope(request = {}, result = {}) {
  return {
    task_id: pickFirst(request.task_id, request.taskId, result.task_id) || "",
    capability: pickFirst(request.capability, request.name) || "web_automation.run",
    status: result.status || "failed",
    success: Boolean(result.success),
    result,
  };
}

function createOpenClawWebAutomationHandler(opts = {}) {
  const runner = opts.runOpenClawTask || runOpenClawTask;

  return async function handleOpenClawRequest(request = {}) {
    const taskInput = buildTaskInput(request);
    const result = await runner(taskInput, opts.deps || {});
    return buildResponseEnvelope(request, result);
  };
}

module.exports = {
  createOpenClawWebAutomationHandler,
  buildTaskInput,
  buildResponseEnvelope,
  __internal: {
    pickFirst,
  },
};
