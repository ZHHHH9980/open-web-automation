"use strict";

const {
  safeClickByText,
  grabBodyText,
  makeScreenshot,
  compactList,
  sameName,
} = require("./browser/page-helpers");
const { connectBrowser } = require("./browser/cdp");
const { getAutomationPage, markHumanPauseTab } = require("./browser/tabs");

module.exports = {
  safeClickByText,
  grabBodyText,
  makeScreenshot,
  compactList,
  sameName,
  connectBrowser,
  getAutomationPage,
  markHumanPauseTab,
};
