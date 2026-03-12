"use strict";

const planning = require("./planning");
const runtime = require("./runtime");

function planTask(task, analysis, plan) {
  const result = planning.apply(task, analysis, plan);
  return {
    analysis: result?.analysis ?? analysis,
    plan: result?.plan ?? plan,
    applied: Boolean(result?.applied),
    applied_by: result?.applied ? planning.name : null,
  };
}

module.exports = {
  name: "zhihu",
  domains: ["zhihu.com"],
  matches: runtime.matches,
  planTask,
  normalizeListItem: runtime.normalizeListItem,
  isUsefulDisplayItem: runtime.isUsefulDisplayItem,
  resolveApiConfigOverride: runtime.resolveApiConfigOverride,
  canCollectListEntries: runtime.canCollectListEntries,
  explainListCollectionSupport: runtime.explainListCollectionSupport,
  collectListEntries: runtime.collectListEntries,
  resolveCurrentUserProfile: runtime.resolveCurrentUserProfile,
  resolveCurrentUserPlaceholder: runtime.resolveCurrentUserPlaceholder,
  resolveCapturedItemUrl: runtime.resolveCapturedItemUrl,
  __internal: {
    planning: planning.__internal,
    runtime: runtime.__internal,
  },
};
