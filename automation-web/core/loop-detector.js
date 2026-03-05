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
    this.modalMode = false; // 是否为弹窗模式
  }

  /**
   * 记录一步
   */
  record(step) {
    // 某些动作不应该触发循环检测
    const safeActions = new Set(['extract', 'conclusion', 'wait', 'done', 'fail', 'pause']);

    // 更新弹窗模式状态
    if (step.modal_mode !== undefined) {
      this.modalMode = step.modal_mode;
    }

    // 记录截图大小（但排除安全动作）
    if (step.screenshot_size && !safeActions.has(step.action)) {
      this.screenshotSizes.push(step.screenshot_size);
      if (this.screenshotSizes.length > this.maxHistory) {
        this.screenshotSizes.shift();
      }
    }

    // 记录 URL（但排除安全动作，且在弹窗模式下不记录 URL）
    if (step.url && !safeActions.has(step.action) && !this.modalMode) {
      this.urls.push(step.url);
      if (this.urls.length > this.maxHistory) {
        this.urls.shift();
      }
    }

    // 记录操作（但排除安全动作）
    if (step.action && !safeActions.has(step.action)) {
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

    // 在弹窗模式下，只检测截图循环，不检测 URL 和 action 循环
    if (this.modalMode) {
      // 检测截图大小循环（连续 4 次相同，更宽松）
      if (this.screenshotSizes.length >= 4) {
        const last4 = this.screenshotSizes.slice(-4);
        if (last4[0] === last4[1] && last4[1] === last4[2] && last4[2] === last4[3]) {
          reasons.push(`screenshot_size_loop: ${last4[0]} bytes (4 times in modal mode)`);
        }
      }
      return {
        isLoop: reasons.length > 0,
        reasons
      };
    }

    // 非弹窗模式：正常检测
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
