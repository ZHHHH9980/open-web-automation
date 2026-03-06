#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { runAgentTask } = require("./llm-agent");

function writeJsonLine(obj) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function saveExtractedContent(result) {
  const extractionFile = result.meta?.extraction_file;
  const conclusion = result.meta?.conclusion;

  if (!extractionFile && !conclusion) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFile = `/tmp/owa_result_${timestamp}.txt`;

  let content = "";

  if (conclusion) {
    content += "=== 总结 ===\n\n";
    content += `${conclusion.summary || ""}\n\n`;
    if (conclusion.keyPoints && conclusion.keyPoints.length > 0) {
      content += "关键要点:\n";
      conclusion.keyPoints.forEach((point, idx) => content += `${idx + 1}. ${point}\n`);
      content += "\n";
    }
    if (conclusion.links && conclusion.links.length > 0) {
      content += "相关链接:\n";
      conclusion.links.forEach(link => content += `- ${link}\n`);
      content += "\n";
    }
  }

  if (extractionFile && fs.existsSync(extractionFile)) {
    const extractedContent = fs.readFileSync(extractionFile, "utf-8");
    content += "=== 采集的原始数据 ===\n\n";
    content += extractedContent;
  }

  fs.writeFileSync(outputFile, content, "utf-8");
  return outputFile;
}

(async () => {
  try {
    const args = process.argv.slice(2);
    const opts = {};
    const taskParts = [];

    for (const arg of args) {
      if (arg.startsWith("--debug-mode=")) {
        opts.debugMode = arg.split("=")[1] === "true";
      } else {
        taskParts.push(arg);
      }
    }

    const input = taskParts.join(" ");
    const startTime = Date.now();

    const result = await runAgentTask(input, opts);

    const duration = Date.now() - startTime;

    // 保存提取的内容到文件
    const outputFile = saveExtractedContent(result);
    if (outputFile) {
      process.stderr.write(`\n✓ 内容已保存到: ${outputFile}\n\n`);
    }

    await writeJsonLine(result);
    process.exitCode = result.exit_code || (result.success ? 0 : 1);
  } catch (err) {
    await writeJsonLine({
      success: false,
      message: `agent runtime exception: ${err.message || err}`,
      has_screenshot: false,
      screenshot: "",
      exit_code: 1,
      timestamp: new Date().toISOString(),
      meta: { error: String(err), requires_human: false },
    });
    process.exitCode = 1;
  }
})();
