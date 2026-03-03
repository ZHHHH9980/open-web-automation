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

function looksLikeHumanIntervention(text, url) {
  const hay = `${text || ""}
${url || ""}`.toLowerCase();
  const patterns = [
    /验证码/,
    /滑块/,
    /安全验证/,
    /请先登录/,
    /登录注册/,
    /请完成验证/,
    /captcha/,
    /verify you are human/,
    /human verification/,
    /risk control/,
    /风控/,
  ];
  return patterns.some((re) => re.test(hay));
}

module.exports = {
  nowIso,
  toResult,
  looksLikeHumanIntervention,
};
