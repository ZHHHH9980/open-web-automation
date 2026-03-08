"use strict";

const runtime = require("./runtime");

function planTask(task, analysis, plan) {
  return {
    analysis,
    plan,
    applied: false,
    applied_by: null,
  };
}

module.exports = {
  name: "xiaohongshu",
  domains: ["xiaohongshu.com"],
  matches: runtime.matches,
  planTask,
  canHandleClick: runtime.canHandleClick,
  explainClickSupport: runtime.explainClickSupport,
  executeClick: runtime.executeClick,
  __internal: {
    runtime: runtime.__internal,
  },
};
