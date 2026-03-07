"use strict";

function nowIso() {
  return new Date().toISOString();
}

function toResult(opts) {
  const meta = opts.meta || {};
  return {
    success: Boolean(opts.success),
    message: opts.message || "",
    has_screenshot: Boolean(opts.screenshot),
    screenshot: opts.screenshot || "",
    exit_code: opts.exit_code != null ? opts.exit_code : (opts.success ? 0 : 1),
    timestamp: nowIso(),
    meta,
  };
}

module.exports = {
  nowIso,
  toResult,
};
