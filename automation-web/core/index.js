"use strict";

/**
 * Core modules unified export
 *
 * This file serves as the single entry point for all core modules.
 * When renaming or moving files, only update this file.
 */

module.exports = {
  // Site resolution
  siteResolver: require("./site-resolver"),

  // Site configuration
  siteConfig: require("./site-config"),

  // Task analysis
  taskAnalyzer: require("./task-analyzer"),

  // Browser control
  browser: require("./browser"),

  // State collection
  stateCollector: require("./state-collector"),

  // Action execution
  executor: require("./executor"),

  // Prompt building
  promptBuilder: require("./prompt-builder"),

  // Loop detection
  loopDetector: require("./loop-detector"),

  // Task planning
  taskPlanner: require("./task-planner"),

  // Conclusion generation
  conclusionGenerator: require("./conclusion-generator"),

  // Result protocol
  result: require("./result"),
};
