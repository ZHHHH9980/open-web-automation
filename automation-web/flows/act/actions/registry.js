"use strict";

const definitions = [
  require("./definitions/goto"),
  require("./definitions/click"),
  require("./definitions/wait"),
  require("./definitions/listen"),
  require("./definitions/scrape-list"),
  require("./definitions/scrape-detail"),
  require("./definitions/back"),
  require("./definitions/done"),
  require("./definitions/fail"),
  require("./definitions/pause"),
];

const ACTION_DEFINITIONS = Object.freeze(definitions);
const ACTION_MAP = new Map(ACTION_DEFINITIONS.map((definition) => [definition.name, definition]));
const ALLOWED_ACTIONS = new Set(ACTION_DEFINITIONS.map((definition) => definition.name));
const CATEGORY_ORDER = ["Navigation", "Interaction", "Data", "Control"];

function getActionDefinition(actionName) {
  return ACTION_MAP.get(String(actionName || "").toLowerCase()) || null;
}

function getAllowedActionNames() {
  return ACTION_DEFINITIONS.map((definition) => definition.name);
}

function buildActionCatalogLines() {
  const categoryMap = new Map();
  for (const category of CATEGORY_ORDER) {
    categoryMap.set(category, []);
  }

  for (const definition of ACTION_DEFINITIONS) {
    if (!categoryMap.has(definition.category)) {
      categoryMap.set(definition.category, []);
    }
    categoryMap.get(definition.category).push(definition.name);
  }

  return CATEGORY_ORDER
    .filter((category) => (categoryMap.get(category) || []).length > 0)
    .map((category) => `- ${category}: ${(categoryMap.get(category) || []).join(", ")}`);
}

function buildPlannerActionReference() {
  const lines = ["Action Reference:"];

  for (const definition of ACTION_DEFINITIONS) {
    lines.push(`- ${definition.name}: ${definition.summary}`);
    for (const parameter of definition.parameters || []) {
      lines.push(`  params: ${parameter}`);
    }
    for (const rule of definition.rules || []) {
      lines.push(`  rule: ${rule}`);
    }
    for (const example of definition.examples || []) {
      lines.push(`  example: ${JSON.stringify(example)}`);
    }
  }

  return lines;
}

function sanitizeCommonDecision(action, obj) {
  const reason = (obj.reason || "planner_decision").replace(/\s+/g, " ").trim();
  const out = { action, reason };

  if (obj.url != null) out.url = String(obj.url);
  if (obj.result != null) out.result = String(obj.result);
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) out.data = obj.data;

  if (obj.wait_ms != null && Number.isFinite(Number(obj.wait_ms))) out.wait_ms = Math.max(0, Math.min(20000, Math.floor(Number(obj.wait_ms))));
  if (obj.max_items != null && Number.isFinite(Number(obj.max_items))) out.max_items = Math.max(1, Math.floor(Number(obj.max_items)));

  return out;
}

function validateActionDecision(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const action = String(obj.action || "").toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) return null;
  return sanitizeCommonDecision(action, obj);
}

module.exports = {
  ACTION_DEFINITIONS,
  ALLOWED_ACTIONS,
  getActionDefinition,
  getAllowedActionNames,
  buildActionCatalogLines,
  buildPlannerActionReference,
  validateActionDecision,
};
