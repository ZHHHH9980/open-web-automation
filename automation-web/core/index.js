"use strict";

module.exports = {
  utils: require("../shared/utils"),
  actions: require("../flows/act/actions"),
  siteConfig: require("../flows/act/site-config"),
  taskInitializer: require("../flows/init/task-initializer"),
  browser: require("../flows/init/browser"),
  stateCollector: require("../flows/act/state-collector"),
  executor: require("../flows/act/executor"),
  taskPlanner: require("../flows/plan/task-planner"),
  conclusionGenerator: require("../flows/finish/conclusion-generator"),
  result: require("../flows/finish/result"),
};
