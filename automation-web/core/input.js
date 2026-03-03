"use strict";

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function cleanCreatorName(name) {
  if (!name) return "";
  return String(name)
    .replace(/^[：:\s]+|[，。！？!?,\s]+$/g, "")
    .replace(/^(这个|该)?(博主|作者|用户)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSite(site) {
  const x = String(site || "").trim().toLowerCase();
  if (!x) return "";
  if (x === "google" || x === "谷歌") return "google";
  if (x === "zhihu" || x === "知乎") return "zhihu";
  if (x === "xiaohongshu" || x === "xhs" || x === "rednote" || x === "小红书") return "xiaohongshu";
  return x;
}

function normalizeAction(action) {
  return String(action || "").trim().toLowerCase();
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseStructuredTask(rawTask) {
  const raw = normalizeText(rawTask);
  if (!raw) {
    return { ok: false, error: "任务为空，请传结构化 JSON 指令。", raw };
  }

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (_err) {
    return {
      ok: false,
      error:
        "已移除槽位/正则解析。请传 JSON：{\"site\":\"zhihu\",\"action\":\"latest_answer\",\"creator\":\"梦中的桃花源\"}",
      raw,
    };
  }

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, error: "指令 JSON 必须是对象。", raw };
  }

  const root = obj.command && typeof obj.command === "object" ? obj.command : obj;
  const params = root.params && typeof root.params === "object" ? root.params : {};

  const site = normalizeSite(root.site);
  const action = normalizeAction(root.action);

  const command = {
    site,
    action,
    query: normalizeText(params.query ?? root.query ?? ""),
    creator: cleanCreatorName(params.creator ?? root.creator ?? ""),
    payload: params.payload ?? root.payload ?? {},
    limit: toInt(params.limit ?? root.limit, 10),
    creator_index: toInt(params.creator_index ?? root.creator_index, 3),
    post_index: toInt(params.post_index ?? root.post_index, 2),
    raw,
  };

  if (!site || !action) {
    return {
      ok: false,
      error: "指令缺少 site/action。",
      raw,
      parsed: command,
    };
  }

  return { ok: true, raw, parsed: command };
}

module.exports = {
  parseStructuredTask,
};
