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

  // 更严格的检测：需要同时满足多个条件才判定为需要登录
  const hasLoginKeyword = /请先登录|需要登录|请登录|立即登录|扫码登录|login required|please login|sign in to continue/.test(hay);
  const hasModalKeyword = /登录弹窗|登录.*弹出|modal.*login|login.*modal/.test(hay);
  const hasCaptcha = /验证码|滑块|安全验证|请完成验证|captcha|verify you are human|human verification/.test(hay);
  const hasRiskControl = /risk control|风控/.test(hay);

  // 只有明确的登录提示或验证码才判定为需要人工介入
  // 单纯的 class 名称（如 login-modal-wrap）不算
  return hasLoginKeyword || hasModalKeyword || hasCaptcha || hasRiskControl;
}

module.exports = {
  nowIso,
  toResult,
  looksLikeHumanIntervention,
};
