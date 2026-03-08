"use strict";

const { getPlanningModules } = require("../../site-modules");

function applySitePlanningAdapters(task, analysis, plan) {
  let nextAnalysis = analysis;
  let nextPlan = plan;
  let appliedBy = null;

  for (const siteModule of getPlanningModules(analysis?.target_site)) {
    if (typeof siteModule.planTask !== "function") continue;
    const result = siteModule.planTask(task, nextAnalysis, nextPlan);
    if (result?.applied) {
      nextAnalysis = result.analysis;
      nextPlan = result.plan;
      appliedBy = result.applied_by || siteModule.name || null;
      break;
    }
  }

  return {
    analysis: nextAnalysis,
    plan: nextPlan,
    applied_by: appliedBy,
  };
}

module.exports = {
  applySitePlanningAdapters,
};
