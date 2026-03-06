"use strict";

/**
 * Core modules unified export
 *
 * This file serves as the single entry point for all core modules.
 * When renaming or moving files, only update this file.
 */

module.exports = {
  // Utilities
  utils: require("./utils"),

  // Actions handlers
  actions: require("./actions"),

  // Site configuration
  siteConfig: require("./site-config"),

  // Task initialization
  taskInitializer: require("./task-initializer"),

  // Browser control
  browser: require("./browser"),

  // State collection
  stateCollector: require("./state-collector"),

  // Action execution
  executor: require("./executor"),

  // Loop detection
  loopDetector: require("./loop-detector"),

  // Task planning
  taskPlanner: require("./task-planner"),

  // Conclusion generation
  conclusionGenerator: require("./conclusion-generator"),

  // Result protocol
  result: require("./result"),
};
