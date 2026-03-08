"use strict";

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function resolveSelector(decision, state) {
  if (decision.selector) return decision.selector;
  if (!decision.target_id) return "";
  const hit = (state?.candidates || []).find((x) => Number(x.id) === Number(decision.target_id));
  return hit ? hit.selector : "";
}

function hasCandidateTarget(decision, state) {
  if (!decision.target_id) return false;
  return (state?.candidates || []).some((candidate) => Number(candidate.id) === Number(decision.target_id));
}

function getValueByPath(value, path) {
  if (!path) return value;

  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => {
      if (current == null) return undefined;
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        return current[Number(key)];
      }
      return current[key];
    }, value);
}

function fillTemplate(template, data) {
  return String(template).replace(/\{([^}]+)\}/g, (_match, key) => {
    const resolved = getValueByPath(data, key);
    return resolved == null ? "" : String(resolved);
  });
}

module.exports = {
  toInt,
  resolveSelector,
  hasCandidateTarget,
  getValueByPath,
  fillTemplate,
};
