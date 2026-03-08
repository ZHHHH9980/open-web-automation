"use strict";

const {
  toInt,
  resolveSelector,
  hasCandidateTarget,
  getValueByPath,
  fillTemplate,
} = require("./helpers/common");
const {
  resolveConfiguredApi,
  getApiResponses,
  findConfiguredApiResponse,
} = require("./helpers/api");
const {
  resolveCurrentUserProfile,
  resolveCurrentUserPlaceholder,
  resolveCapturedItemUrl,
} = require("../../site-adapters");

module.exports = {
  toInt,
  resolveSelector,
  hasCandidateTarget,
  getValueByPath,
  fillTemplate,
  getApiResponses,
  resolveConfiguredApi,
  resolveCurrentUserProfile,
  resolveCurrentUserPlaceholder,
  resolveCapturedItemUrl,
  findConfiguredApiResponse,
};
