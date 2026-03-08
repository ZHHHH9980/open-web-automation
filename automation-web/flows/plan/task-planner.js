"use strict";

const { runPlanner } = require("../../planners");
const { getActionDefinition } = require("../act/actions/registry");
const { buildPlanningPrompt } = require("./prompt-builder");
const { applySitePlanningAdapters } = require("./site-adapters");
const { normalizeTaskAnalysis } = require("./task-analysis");

async function generatePlan(task, state, maxSteps = 15, commonSites = {}) {
  const prompt = buildPlanningPrompt(task, state, maxSteps, commonSites);
  const result = await runPlanner(prompt, null, null);

  if (!result.ok) {
    return { ok: false, error: result.error, rawPlan: result.decision || null };
  }

  const processed = postProcessPlan(task, result.decision?.analysis || null, result.decision?.plan || []);
  const analysis = processed.analysis;
  const plan = processed.plan;
  if (!Array.isArray(plan) || plan.length === 0) {
    return { ok: false, error: "Invalid plan structure", rawPlan: result.decision };
  }

  return { ok: true, analysis, plan, rawPlan: result.decision };
}

function postProcessPlan(task, analysis, plan) {
  const normalizedAnalysis = normalizeTaskAnalysis(task, analysis || {}, plan);
  const processed = applySitePlanningAdapters(task, normalizedAnalysis, plan);

  return {
    analysis: normalizeTaskAnalysis(task, processed.analysis || normalizedAnalysis, processed.plan || plan),
    plan: processed.plan,
    applied_by: processed.applied_by,
  };
}

function canExecutePlan(plannedAction, state, context = {}) {
  const definition = getActionDefinition(plannedAction?.action);
  if (!definition || typeof definition.canExecute !== "function") {
    return false;
  }

  return definition.canExecute(plannedAction, state, context);
}

function explainCannotExecutePlan(plannedAction, state, context = {}) {
  const definition = getActionDefinition(plannedAction?.action);
  if (!definition) {
    return `missing action definition for ${plannedAction?.action || "unknown"}`;
  }
  if (typeof definition.explainCanExecute === "function") {
    const reason = definition.explainCanExecute(plannedAction, state, context);
    return String(reason || "").trim();
  }
  if (typeof definition.canExecute !== "function") {
    return `action ${plannedAction?.action || "unknown"} does not implement canExecute`;
  }
  return `action ${plannedAction?.action || "unknown"} returned canExecute=false`;
}

module.exports = {
  generatePlan,
  canExecutePlan,
  explainCannotExecutePlan,
  __internal: {
    postProcessPlan,
    normalizeTaskAnalysis,
  },
};
