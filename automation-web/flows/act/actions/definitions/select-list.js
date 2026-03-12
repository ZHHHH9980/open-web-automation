"use strict";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasListCapture(context = {}) {
  const capture = context.lastListCapture || {};
  return Array.isArray(capture.display_items) && capture.display_items.length > 0;
}

function parseSimpleChineseNumber(input) {
  const text = String(input || "").trim();
  if (!text) return NaN;

  if (/^两$/.test(text)) return 2;
  if (/^[零〇一二两三四五六七八九十百千]+$/.test(text) === false) return NaN;

  const digits = new Map([
    ["零", 0], ["〇", 0], ["一", 1], ["二", 2], ["两", 2], ["三", 3], ["四", 4],
    ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9],
  ]);
  const units = new Map([["十", 10], ["百", 100], ["千", 1000]]);

  let total = 0;
  let current = 0;

  for (const char of text) {
    if (digits.has(char)) {
      current = digits.get(char);
      continue;
    }
    if (units.has(char)) {
      const unit = units.get(char);
      total += (current || 1) * unit;
      current = 0;
      continue;
    }
    return NaN;
  }

  return total + current;
}

function replaceChineseNumerals(expression) {
  return String(expression || "").replace(/[零〇一二两三四五六七八九十百千]+/g, (token) => {
    const parsed = parseSimpleChineseNumber(token);
    return Number.isFinite(parsed) ? String(parsed) : token;
  });
}

function evaluateNumericExpression(raw) {
  const replaced = replaceChineseNumerals(raw);
  const compact = String(replaced || "").replace(/\s+/g, "");
  if (!compact) return NaN;

  if (/^\d+$/.test(compact)) {
    return Number(compact);
  }

  if (!/^[\d()+\-*/]+$/.test(compact)) {
    return NaN;
  }

  try {
    const value = Function(`"use strict"; return (${compact});`)();
    if (!Number.isFinite(value)) return NaN;
    return Math.trunc(value);
  } catch (_err) {
    return NaN;
  }
}

function clampRange(start, end) {
  return start <= end ? [start, end] : [end, start];
}

function buildSequentialIndices(start, end) {
  const indices = [];
  for (let index = start; index <= end; index += 1) {
    indices.push(index);
  }
  return indices;
}

function parseOrdinalSelection(query) {
  const normalized = normalizeWhitespace(query);
  const rangeMatch = normalized.match(/第\s*([^篇条个到至~～—]+?)\s*(?:到|至|~|～|—)\s*([^篇条个]+?)\s*(?:篇|条|个)/);
  if (rangeMatch) {
    const start = evaluateNumericExpression(rangeMatch[1]);
    const end = evaluateNumericExpression(rangeMatch[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return { kind: "range", start, end };
    }
  }

  const singleMatch = normalized.match(/第\s*([^篇条个]+?)\s*(?:篇|条|个)/);
  if (!singleMatch) return null;

  const ordinal = evaluateNumericExpression(singleMatch[1]);
  if (!Number.isFinite(ordinal)) return null;
  return { kind: "single", index: ordinal };
}

function parseCountSelection(query) {
  const normalized = normalizeWhitespace(query);
  const rangeMatch = normalized.match(/(?:前|最新|最近)\s*([^篇条个到至~～—]+?)\s*(?:到|至|~|～|—)\s*([^篇条个]+?)\s*(?:篇|条|个)/);
  if (rangeMatch) {
    const start = evaluateNumericExpression(rangeMatch[1]);
    const end = evaluateNumericExpression(rangeMatch[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return { kind: "top_range", start, end };
    }
  }

  const countMatch = normalized.match(/(?:前|最新|最近)\s*([^篇条个]+?)\s*(?:篇|条|个)/);
  if (!countMatch) return null;

  const count = evaluateNumericExpression(countMatch[1]);
  if (!Number.isFinite(count)) return null;
  return { kind: "top_count", count };
}

function resolveSelection(query, totalItems) {
  const total = Math.max(0, Number(totalItems) || 0);
  if (total === 0) {
    throw new Error("select_list: no list items are available");
  }

  const ordinalSelection = parseOrdinalSelection(query);
  if (ordinalSelection?.kind === "single") {
    if (ordinalSelection.index < 1) {
      throw new Error(`select_list: requested ordinal ${ordinalSelection.index} is invalid`);
    }
    if (ordinalSelection.index > total) {
      throw new Error(`select_list: requested ordinal ${ordinalSelection.index} exceeds available item count ${total}`);
    }
    return [ordinalSelection.index - 1];
  }

  if (ordinalSelection?.kind === "range") {
    if (ordinalSelection.start < 1 || ordinalSelection.end < 1) {
      throw new Error(`select_list: requested range ${ordinalSelection.start}-${ordinalSelection.end} is invalid`);
    }
    const [start, end] = clampRange(ordinalSelection.start, ordinalSelection.end);
    if (end > total) {
      throw new Error(`select_list: requested range ${start}-${end} exceeds available item count ${total}`);
    }
    return buildSequentialIndices(start - 1, end - 1);
  }

  const countSelection = parseCountSelection(query);
  if (countSelection?.kind === "top_count") {
    if (countSelection.count < 1) {
      throw new Error(`select_list: requested count ${countSelection.count} is invalid`);
    }
    const end = Math.min(total, countSelection.count);
    return buildSequentialIndices(0, end - 1);
  }

  if (countSelection?.kind === "top_range") {
    if (countSelection.start < 1 || countSelection.end < 1) {
      throw new Error(`select_list: requested top range ${countSelection.start}-${countSelection.end} is invalid`);
    }
    const [start, end] = clampRange(countSelection.start, countSelection.end);
    if (start > total) {
      throw new Error(`select_list: requested top range ${start}-${end} exceeds available item count ${total}`);
    }
    return buildSequentialIndices(start - 1, Math.min(total, end) - 1);
  }

  return [0];
}

module.exports = {
  name: "select_list",
  category: "Data",
  summary: "Select one or more items from the previously captured list using the original request.",
  parameters: [
    "selection_query (optional): natural-language selection request; defaults to the current task when available.",
    "capture (optional): save the selected subset for final conclusion, default true.",
  ],
  examples: [
    { action: "select_list", selection_query: "看最新第二篇文章", reason: "Choose the second newest item from the captured list" },
    { action: "select_list", selection_query: "看最新两篇文章", reason: "Choose the top two newest items from the captured list" },
  ],
  rules: [
    "Requires a prior scrape_list capture in the current execution context.",
    "Selection runs against the current captured order; sort upstream if time ranking matters.",
  ],
  canExecute(_action, _state, context = {}) {
    return hasListCapture(context);
  },
  explainCanExecute(_action, _state, context = {}) {
    if (hasListCapture(context)) return "";
    return "select_list requires a previously captured list";
  },
  async execute(_page, action, _state, context = {}) {
    const capture = context.lastListCapture || {};
    const displayItems = Array.isArray(capture.display_items) ? capture.display_items : [];
    const rawItems = Array.isArray(capture.items) ? capture.items : [];
    const query = normalizeWhitespace(action.selection_query || context.task || "");
    const selectedIndices = resolveSelection(query, displayItems.length);

    const nextDisplayItems = selectedIndices.map((index) => displayItems[index]).filter(Boolean);
    const nextRawItems = selectedIndices.map((index) => rawItems[index]).filter(Boolean);

    if (nextDisplayItems.length === 0) {
      throw new Error("select_list: no items matched the requested selection");
    }

    return {
      done: false,
      data: {
        ...capture,
        items: nextRawItems,
        display_items: nextDisplayItems,
        count: nextDisplayItems.length,
        selected_indices: selectedIndices.map((index) => index + 1),
        selection_query: query,
        source: capture.source || "selection",
      },
      note: `select_list: selected ${nextDisplayItems.length} item(s) from captured list${query ? ` for '${query}'` : ""}`,
    };
  },
  __internal: {
    parseSimpleChineseNumber,
    replaceChineseNumerals,
    evaluateNumericExpression,
    parseOrdinalSelection,
    parseCountSelection,
    resolveSelection,
  },
};
