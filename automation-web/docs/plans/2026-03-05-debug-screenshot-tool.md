# Debug Screenshot Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an independent debug project to investigate visual model recognition issues by saving and displaying screenshots at each step.

**Architecture:** Lightweight wrapper around the existing automation-web project that intercepts screenshot generation, saves them to a local directory, and logs metadata for debugging.

**Tech Stack:** Node.js, Playwright (reused from parent project), filesystem operations

---

## Task 1: Create Project Structure

**Files:**
- Create: `/Users/a1/Documents/automation-web-debug/package.json`
- Create: `/Users/a1/Documents/automation-web-debug/.gitignore`
- Create: `/Users/a1/Documents/automation-web-debug/README.md`

**Step 1: Verify parent directory exists**

Run: `ls -la /Users/a1/Documents`
Expected: Directory exists

**Step 2: Create project directory**

Run: `mkdir -p /Users/a1/Documents/automation-web-debug`

**Step 3: Create package.json**

```json
{
  "name": "automation-web-debug",
  "version": "1.0.0",
  "description": "Debug tool for investigating visual model recognition issues",
  "main": "debug-task.js",
  "scripts": {
    "debug": "node debug-task.js"
  },
  "dependencies": {
    "playwright": "^1.52.0"
  }
}
```

**Step 4: Create .gitignore**

```
node_modules/
screenshots/
logs/
*.log
```

**Step 5: Create README.md**

```markdown
# Automation Web Debug Tool

Debug tool for investigating visual model recognition issues in web automation tasks.

## Usage

```bash
node debug-task.js "your task description"
```

## Output

- Screenshots: `screenshots/[task-id]/step-N.png`
- Logs: `logs/[task-id].json`

## Features

- Saves all screenshots to local directory
- Outputs screenshot path for each step
- Records candidates count to identify empty lists
- Generates execution log for analysis
```

**Step 6: Install dependencies**

Run: `cd /Users/a1/Documents/automation-web-debug && npm install`
Expected: playwright installed successfully

**Step 7: Commit**

```bash
cd /Users/a1/Documents/automation-web-debug
git init
git add package.json .gitignore README.md
git commit -m "chore: initialize debug project structure"
```

---

## Task 2: Create Core Debug Entry Point

**Files:**
- Create: `/Users/a1/Documents/automation-web-debug/debug-task.js`

**Step 1: Write basic entry point**

```javascript
"use strict";

const fs = require("fs");
const path = require("path");

// Import from parent project
const { runAgentTask } = require("../open-web-automation/automation-web/llm-agent");

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function main() {
  const taskDescription = process.argv.slice(2).join(" ");

  if (!taskDescription) {
    console.error("Usage: node debug-task.js <task description>");
    process.exit(1);
  }

  const taskId = generateTaskId();
  console.log(`[debug] Task ID: ${taskId}`);
  console.log(`[debug] Task: ${taskDescription}`);

  // Create directories
  const screenshotDir = path.join(__dirname, "screenshots", taskId);
  const logsDir = path.join(__dirname, "logs");
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  console.log(`[debug] Screenshots will be saved to: ${screenshotDir}/`);

  // Run the task
  const result = await runAgentTask(taskDescription, {
    debugMode: true,
    includeScreenshot: true,
  });

  console.log(`[debug] Task completed with exit code: ${result.exit_code}`);
  console.log(`[debug] Result: ${result.message}`);

  process.exit(result.exit_code);
}

main().catch((err) => {
  console.error("[debug] Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Test basic execution**

Run: `cd /Users/a1/Documents/automation-web-debug && node debug-task.js "test task"`
Expected: Should connect to browser and attempt to run task (may fail, but should not crash)

**Step 3: Commit**

```bash
cd /Users/a1/Documents/automation-web-debug
git add debug-task.js
git commit -m "feat: add basic debug entry point"
```

---

## Task 3: Add Screenshot Interception

**Files:**
- Modify: `/Users/a1/Documents/automation-web-debug/debug-task.js`

**Step 1: Add screenshot saving wrapper**

Add this function before `main()`:

```javascript
function createScreenshotSaver(taskId, screenshotDir) {
  let stepCounter = 0;

  return {
    saveScreenshot(base64Data, stepNumber) {
      const filename = `step-${stepNumber || ++stepCounter}.png`;
      const filepath = path.join(screenshotDir, filename);

      if (base64Data) {
        fs.writeFileSync(filepath, Buffer.from(base64Data, "base64"));
        console.log(`[step ${stepNumber}] screenshot: ${filepath}`);
        return filepath;
      }

      return null;
    },
  };
}
```

**Step 2: Modify main() to use wrapper**

Replace the `// Run the task` section with:

```javascript
  const screenshotSaver = createScreenshotSaver(taskId, screenshotDir);

  // Monkey-patch the screenshot function
  const originalMakeScreenshot = require("../open-web-automation/automation-web/core/browser").makeScreenshot;
  const browserModule = require("../open-web-automation/automation-web/core/browser");

  browserModule.makeScreenshot = async function (page, label) {
    const result = await originalMakeScreenshot.call(this, page, label);

    // Extract step number from label (e.g., "agent-step-3" -> 3)
    const stepMatch = label.match(/step-(\d+)/);
    const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : null;

    if (result.base64) {
      const savedPath = screenshotSaver.saveScreenshot(result.base64, stepNumber);
      result.savedPath = savedPath;
    }

    return result;
  };

  // Run the task
  const result = await runAgentTask(taskDescription, {
    debugMode: true,
    includeScreenshot: true,
  });
```

**Step 3: Test screenshot saving**

Run: `cd /Users/a1/Documents/automation-web-debug && node debug-task.js "open google.com"`
Expected: Should see screenshot paths printed and files saved to screenshots/[task-id]/

**Step 4: Verify screenshots exist**

Run: `ls -lh /Users/a1/Documents/automation-web-debug/screenshots/*/`
Expected: PNG files exist with reasonable sizes

**Step 5: Commit**

```bash
cd /Users/a1/Documents/automation-web-debug
git add debug-task.js
git commit -m "feat: add screenshot interception and saving"
```

---

## Task 4: Add Execution Logging

**Files:**
- Modify: `/Users/a1/Documents/automation-web-debug/debug-task.js`

**Step 1: Add logging functions**

Add these functions before `main()`:

```javascript
function createLogger(taskId, logsDir) {
  const logPath = path.join(logsDir, `${taskId}.json`);
  const log = {
    task_id: taskId,
    task: "",
    started_at: new Date().toISOString(),
    steps: [],
  };

  return {
    setTask(taskDescription) {
      log.task = taskDescription;
    },

    logStep(stepData) {
      log.steps.push({
        ...stepData,
        timestamp: new Date().toISOString(),
      });
      this.save();
    },

    save() {
      fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    },

    getPath() {
      return logPath;
    },
  };
}
```

**Step 2: Integrate logger into main()**

After creating `screenshotSaver`, add:

```javascript
  const logger = createLogger(taskId, logsDir);
  logger.setTask(taskDescription);
```

**Step 3: Hook into state collection**

Add this after the screenshot monkey-patch:

```javascript
  // Monkey-patch collectPageState to log candidates
  const stateCollectorModule = require("../open-web-automation/automation-web/core/state-collector");
  const originalCollectPageState = stateCollectorModule.collectPageState;

  stateCollectorModule.collectPageState = async function (page, step, candidateLimit) {
    const state = await originalCollectPageState.call(this, page, step, candidateLimit);

    // Log this step
    logger.logStep({
      step,
      url: state.url,
      title: state.title,
      candidates_count: state.candidates.length,
      screenshot: `screenshots/${taskId}/step-${step}.png`,
    });

    // Print candidates count with warning if empty
    const warning = state.candidates.length === 0 ? " ⚠️" : "";
    console.log(`  └─ candidates: ${state.candidates.length} elements found${warning}`);

    return state;
  };
```

**Step 4: Add final log output**

Before `process.exit(result.exit_code)`, add:

```javascript
  console.log(`[debug] Log saved to: ${logger.getPath()}`);
```

**Step 5: Test logging**

Run: `cd /Users/a1/Documents/automation-web-debug && node debug-task.js "search google for playwright"`
Expected: Should see candidates count printed and log file created

**Step 6: Verify log file**

Run: `cat /Users/a1/Documents/automation-web-debug/logs/*.json | head -50`
Expected: JSON file with task info and steps array

**Step 7: Commit**

```bash
cd /Users/a1/Documents/automation-web-debug
git add debug-task.js
git commit -m "feat: add execution logging with candidates tracking"
```

---

## Task 5: Add Action Logging

**Files:**
- Modify: `/Users/a1/Documents/automation-web-debug/debug-task.js`

**Step 1: Enhance step logging to include actions**

Modify the `collectPageState` monkey-patch to store state for later action logging:

```javascript
  let lastState = null;

  stateCollectorModule.collectPageState = async function (page, step, candidateLimit) {
    const state = await originalCollectPageState.call(this, page, step, candidateLimit);

    lastState = state;

    // Log this step (will be updated with action later)
    logger.logStep({
      step,
      url: state.url,
      title: state.title,
      candidates_count: state.candidates.length,
      screenshot: `screenshots/${taskId}/step-${step}.png`,
      action: null, // Will be filled by executor
    });

    const warning = state.candidates.length === 0 ? " ⚠️" : "";
    console.log(`  └─ candidates: ${state.candidates.length} elements found${warning}`);

    return state;
  };
```

**Step 2: Hook into executor to log actions**

Add after the state collector monkey-patch:

```javascript
  // Monkey-patch executeDecision to log actions
  const executorModule = require("../open-web-automation/automation-web/core/executor");
  const originalExecuteDecision = executorModule.executeDecision;

  executorModule.executeDecision = async function (page, decision, state, debug) {
    const result = await originalExecuteDecision.call(this, page, decision, state, debug);

    // Update the last logged step with action info
    const steps = logger.log.steps;
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      lastStep.action = decision.action;
      lastStep.action_details = {
        reason: decision.reason,
        selector: decision.selector,
        text: decision.text,
        url: decision.url,
      };
      logger.save();
    }

    return result;
  };
```

**Step 3: Fix logger access**

Modify the `createLogger` function to expose the log object:

```javascript
function createLogger(taskId, logsDir) {
  const logPath = path.join(logsDir, `${taskId}.json`);
  const log = {
    task_id: taskId,
    task: "",
    started_at: new Date().toISOString(),
    steps: [],
  };

  return {
    log, // Expose log object

    setTask(taskDescription) {
      log.task = taskDescription;
    },

    // ... rest of the methods
  };
}
```

**Step 4: Test action logging**

Run: `cd /Users/a1/Documents/automation-web-debug && node debug-task.js "open github.com"`
Expected: Log file should include action and action_details for each step

**Step 5: Verify action details in log**

Run: `cat /Users/a1/Documents/automation-web-debug/logs/*.json | grep -A 5 action_details | head -20`
Expected: Should see action details with reason, selector, etc.

**Step 6: Commit**

```bash
cd /Users/a1/Documents/automation-web-debug
git add debug-task.js
git commit -m "feat: add action logging to execution log"
```

---

## Task 6: Add Summary Report

**Files:**
- Modify: `/Users/a1/Documents/automation-web-debug/debug-task.js`

**Step 1: Add summary function**

Add this function before `main()`:

```javascript
function printSummary(logger, result) {
  console.log("\n" + "=".repeat(60));
  console.log("DEBUG SUMMARY");
  console.log("=".repeat(60));

  const steps = logger.log.steps;
  const totalSteps = steps.length;
  const stepsWithCandidates = steps.filter((s) => s.candidates_count > 0).length;
  const stepsWithoutCandidates = steps.filter((s) => s.candidates_count === 0).length;

  console.log(`Total steps: ${totalSteps}`);
  console.log(`Steps with candidates: ${stepsWithCandidates}`);
  console.log(`Steps without candidates: ${stepsWithoutCandidates}`);

  if (stepsWithoutCandidates > 0) {
    console.log("\n⚠️  Steps with empty candidates list:");
    steps
      .filter((s) => s.candidates_count === 0)
      .forEach((s) => {
        console.log(`  - Step ${s.step}: ${s.url}`);
        console.log(`    Screenshot: ${s.screenshot}`);
      });
  }

  console.log(`\nScreenshots directory: screenshots/${logger.log.task_id}/`);
  console.log(`Log file: ${logger.getPath()}`);
  console.log("=".repeat(60) + "\n");
}
```

**Step 2: Call summary before exit**

Replace the final log output section with:

```javascript
  printSummary(logger, result);
  process.exit(result.exit_code);
```

**Step 3: Test summary output**

Run: `cd /Users/a1/Documents/automation-web-debug && node debug-task.js "test summary"`
Expected: Should see formatted summary with statistics

**Step 4: Commit**

```bash
cd /Users/a1/Documents/automation-web-debug
git add debug-task.js
git commit -m "feat: add summary report with candidates statistics"
```

---

## Task 7: Final Testing and Documentation

**Files:**
- Modify: `/Users/a1/Documents/automation-web-debug/README.md`

**Step 1: Update README with complete usage**

```markdown
# Automation Web Debug Tool

Debug tool for investigating visual model recognition issues in web automation tasks.

## Installation

```bash
cd /Users/a1/Documents/automation-web-debug
npm install
```

## Usage

```bash
node debug-task.js "your task description"
```

Example:
```bash
node debug-task.js "open google.com and search for playwright"
```

## Output

### Screenshots
All screenshots are saved to `screenshots/[task-id]/step-N.png`

### Logs
Execution logs are saved to `logs/[task-id].json` with:
- Task description
- Each step's URL, title, candidates count
- Action details (type, reason, selector)
- Timestamps

### Terminal Output
```
[debug] Task ID: task_1709625600_abc123
[debug] Screenshots will be saved to: screenshots/task_1709625600_abc123/
[step 1] screenshot: screenshots/task_1709625600_abc123/step-1.png
  └─ candidates: 15 elements found
[step 2] screenshot: screenshots/task_1709625600_abc123/step-2.png
  └─ candidates: 0 elements found ⚠️
...
============================================================
DEBUG SUMMARY
============================================================
Total steps: 5
Steps with candidates: 3
Steps without candidates: 2

⚠️  Steps with empty candidates list:
  - Step 2: https://example.com/detail
    Screenshot: screenshots/task_1709625600_abc123/step-2.png
...
```

## Debugging Workflow

1. Run your task with this debug tool
2. Check the summary for steps with 0 candidates
3. Open the screenshots for those steps
4. Verify if the page is rendered correctly
5. Check the log file for detailed action history

## Differences from Original Project

- Screenshots saved to project directory (not `/tmp`)
- Candidates count printed for each step
- Empty candidates highlighted with ⚠️
- Complete execution log saved
- Summary report at the end
```

**Step 2: Test complete workflow**

Run: `cd /Users/a1/Documents/automation-web-debug && node debug-task.js "open example.com"`
Expected: Complete execution with screenshots, logs, and summary

**Step 3: Verify all outputs exist**

Run: `ls -R /Users/a1/Documents/automation-web-debug/screenshots/ /Users/a1/Documents/automation-web-debug/logs/`
Expected: Both directories contain files

**Step 4: Commit**

```bash
cd /Users/a1/Documents/automation-web-debug
git add README.md
git commit -m "docs: update README with complete usage guide"
```

**Step 5: Create final commit with all changes**

Run: `cd /Users/a1/Documents/automation-web-debug && git log --oneline`
Expected: Should see all commits from this implementation

---

## Completion Checklist

- [ ] Project structure created
- [ ] Dependencies installed
- [ ] Basic entry point working
- [ ] Screenshots saved to local directory
- [ ] Screenshot paths printed to terminal
- [ ] Execution log created with candidates count
- [ ] Action details logged
- [ ] Summary report generated
- [ ] Empty candidates highlighted with warning
- [ ] README updated with usage guide
- [ ] All changes committed

## Testing the Debug Tool

To verify the tool works for your specific issue:

1. Run a task that you know works (e.g., homepage interaction)
2. Check that screenshots show the page correctly
3. Verify candidates count is > 0
4. Run a task that fails (detail page)
5. Check if screenshots show the page correctly
6. If screenshots are correct but candidates = 0, the issue is in element detection
7. If screenshots are blank/wrong, the issue is in page rendering/timing

## Next Steps

After implementation, use this tool to:
1. Reproduce the issue where detail pages have 0 candidates
2. Examine the screenshots to see if pages are rendered
3. Based on findings, decide if the issue is:
   - Timing (page not fully loaded)
   - Element detection (isVisible logic too strict)
   - Page structure (Shadow DOM, Canvas, etc.)
