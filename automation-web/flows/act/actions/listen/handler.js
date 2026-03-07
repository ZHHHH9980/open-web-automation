"use strict";

const { logProgress } = require("../../../../shared/utils");

/**
 * Handle API listener setup
 * @param {Object} executionContext - Execution context
 * @param {Object} apiCollector - API collector instance
 * @param {boolean} progress - Enable progress logging
 * @returns {void}
 */
function handleApiListener(executionContext, apiCollector, progress) {
  executionContext.currentApiCollector = apiCollector;
  logProgress(progress, "API monitoring started");
}

module.exports = {
  handleApiListener,
};
