/**
 * 循环检测器
 *
 * 检测 Agent 是否陷入循环：
 * - 连续 3 次截图大小相同
 * - 连续 3 次在同一个 URL
 * - 连续 3 次执行相同的操作
 */

class LoopDetector {
  constructor() {
    this.screenshotSizes = [];
    this.urls = [];
    this.actions = [];
    this.maxHistory = 5;
  }

  /**
   * 记录一步
   */
  record(step) {
    // 记录截图大小
    if (step.screenshot_size) {
      this.screenshotSizes.push(step.screenshot_size);
      if (this.screenshotSizes.length > this.maxHistory) {
        this.screenshotSizes.shift();
      }
    }

    // 记录 URL
    if (step.url) {
      this.urls.push(step.url);
      if (this.urls.length > this.maxHistory) {
        this.urls.shift();
      }
    }

    // 记录操作
    if (step.action) {
      this.actions.push(step.action);
      if (this.actions.length > this.maxHistory) {
        this.actions.shift();
      }
    }
  }

  /**
   * 检测是否陷入循环
   */
  detectLoop() {
    const reasons = [];

    // 检测截图大小循环（连续 3 次相同）
    if (this.screenshotSizes.length >= 3) {
      const last3 = this.screenshotSizes.slice(-3);
      if (last3[0] === last3[1] && last3[1] === last3[2]) {
        reasons.push(`screenshot_size_loop: ${last3[0]} bytes (3 times)`);
      }
    }

    // 检测 URL 循环（连续 3 次相同）
    if (this.urls.length >= 3) {
      const last3 = this.urls.slice(-3);
      if (last3[0] === last3[1] && last3[1] === last3[2]) {
        reasons.push(`url_loop: ${last3[0]}`);
      }
    }

    // 检测操作循环（连续 3 次相同操作）
    if (this.actions.length >= 3) {
      const last3 = this.actions.slice(-3);
      if (last3[0] === last3[1] && last3[1] === last3[2]) {
        reasons.push(`action_loop: ${last3[0]} (3 times)`);
      }
    }

    return {
      isLoop: reasons.length > 0,
      reasons
    };
  }

  /**
   * 重置
   */
  reset() {
    this.screenshotSizes = [];
    this.urls = [];
    this.actions = [];
  }
}

module.exports = { LoopDetector };
