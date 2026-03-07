#!/usr/bin/env node

"use strict";

const fs = require("fs");
const { runAgentTask } = require("./flows/orchestrator");
const { loadCapturedEntries } = require("./flows/finish/data-handler");

function writeJsonLine(obj) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function renderStructuredItems(entries) {
  const lines = [];

  for (const entry of entries) {
    const items = entry?.parsed?.items;
    if (!Array.isArray(items) || items.length === 0) {
      continue;
    }

    items.forEach((item, idx) => {
      lines.push(`${idx + 1}. 标题：${item.title || "未命名"}`);
      lines.push(`   作者：${item.author || "未知作者"}`);
      lines.push(`   内容总结：${item.content_summary || ""}`);
      if (item.article_content) {
        lines.push(`   文章内容：${item.article_content}`);
      }
      lines.push(`   详情链接：${item.detail_url || ""}`);
      lines.push(`   点赞数：${Number(item.likes) || 0}`);
      lines.push("");
    });
  }

  return lines.join("\n").trim();
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
    const entries = loadCapturedEntries(extractionFile);
    const structuredContent = renderStructuredItems(entries);

    if (structuredContent) {
      content += "=== 结构化结果 ===\n\n";
      content += structuredContent;
      content += "\n\n";
      content += `原始采集文件：${extractionFile}\n`;
    } else {
      const extractedContent = fs.readFileSync(extractionFile, "utf-8");
      content += "=== 采集的原始数据 ===\n\n";
      content += extractedContent;
    }
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

    const result = await runAgentTask(input, opts);

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
