/**
 * 循环检测器
 *
 * 检测 Agent 是否陷入循环：
 * - 连续 3 次在同一个 URL
 * - 连续 3 次执行相同的操作
 */

class LoopDetector {
  constructor() {
    this.urls = [];
    this.actions = [];
    this.maxHistory = 5;
  }

  /**
   * 记录一步
   */
  record(step) {
    // 某些动作不应该触发循环检测
    const safeActions = new Set(['scrape_list', 'scrape_detail', 'conclusion', 'wait', 'done', 'fail', 'pause']);

    // 记录 URL（但排除安全动作）
    if (step.url && !safeActions.has(step.action)) {
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
    this.urls = [];
    this.actions = [];
  }
}

module.exports = { LoopDetector };
