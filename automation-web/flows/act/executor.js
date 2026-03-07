"use strict";

const { getActionDefinition, validateActionDecision } = require("./actions/registry");
const { resolveSelector } = require("./actions/definitions/helpers");

async function executeDecision(page, decision, state, context = {}) {
  const normalizedDecision = validateActionDecision(decision);
  if (!normalizedDecision) {
    throw new Error(`unsupported action: ${decision?.action || "unknown"}`);
  }

  const definition = getActionDefinition(normalizedDecision.action);
  if (!definition || typeof definition.execute !== "function") {
    throw new Error(`missing action definition for '${normalizedDecision.action}'`);
  }

  return definition.execute(page, normalizedDecision, state, context);
}

module.exports = { executeDecision, resolveSelector };
