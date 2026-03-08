"use strict";

const zhihu = require("./zhihu");
const xiaohongshu = require("./xiaohongshu");

const modules = [zhihu, xiaohongshu];

function matchesDomain(siteModule, domain) {
  const expected = String(domain || "").trim().toLowerCase();
  if (!expected) return false;
  return Array.isArray(siteModule?.domains)
    && siteModule.domains.some((item) => String(item || "").trim().toLowerCase() === expected);
}

function getSiteModule(url) {
  return modules.find((siteModule) => typeof siteModule.matches === "function" && siteModule.matches(url)) || null;
}

function getPlanningModules(targetSite) {
  if (!targetSite) return modules;
  const matched = modules.filter((siteModule) => matchesDomain(siteModule, targetSite));
  return matched.length > 0 ? matched : modules;
}

module.exports = {
  modules,
  getSiteModule,
  getPlanningModules,
  zhihu,
  xiaohongshu,
};
