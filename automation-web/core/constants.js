"use strict";

/**
 * Allowed action types for web automation
 *
 * Navigation:
 * - goto: Navigate to URL
 * - back: Go back in history
 *
 * Interaction:
 * - click: Click element
 * - type: Type text into input
 * - press: Press keyboard key
 * - wait: Wait for time or condition
 *
 * Data:
 * - extract: Extract single content from page
 * - collect: Collect list items from page
 *
 * Control:
 * - close: Close modal/popup or go back
 * - done: Task completed successfully
 * - fail: Task failed
 * - pause: Pause for human intervention
 */
const ALLOWED_ACTIONS = new Set([
  "goto",
  "click",
  "type",
  "press",
  "wait",
  "extract",
  "collect",
  "close",
  "back",
  "done",
  "fail",
  "pause"
]);

module.exports = {
  ALLOWED_ACTIONS
};
