"use strict";

const fs = require("fs");
const { loadCapturedEntries } = require("../flows/finish/data-handler");
const { buildResultFilePath } = require("../shared/utils");
const { normalizeInlineText, formatRichText } = require("./text-format");
const { renderStructuredItems } = require("./render-capture");

function saveExtractedContent(result) {
  const extractionFile = result.meta?.extraction_file;
  const conclusion = result.meta?.conclusion;
  const conclusionGenerator = result.meta?.conclusion_generator || conclusion?.generator || null;

  if (!extractionFile && !conclusion) {
    return null;
  }

  const outputFile = buildResultFilePath(result.meta?.url, "md");
  const sections = ["# 自动化结果"];

  if (conclusion) {
    sections.push("", "## 总结", "", formatRichText(conclusion.summary || ""));
    if (Array.isArray(conclusion.keyPoints) && conclusion.keyPoints.length > 0) {
      sections.push("", "## 关键要点", "");
      conclusion.keyPoints.forEach((point) => sections.push(`- ${normalizeInlineText(point)}`));
    }
    if (Array.isArray(conclusion.links) && conclusion.links.length > 0) {
      sections.push("", "## 相关链接", "");
      conclusion.links.forEach((link) => sections.push(`- ${normalizeInlineText(link)}`));
    }
  }

  if (conclusionGenerator?.label) {
    const generatorLine = conclusionGenerator.error
      ? `${conclusionGenerator.label} (${normalizeInlineText(conclusionGenerator.status || "failed")}: ${normalizeInlineText(conclusionGenerator.error)})`
      : normalizeInlineText(conclusionGenerator.label);
    sections.push("", "## 总结来源", "", `- ${generatorLine}`);
  }

  if (extractionFile && fs.existsSync(extractionFile)) {
    const entries = loadCapturedEntries(extractionFile);
    const structuredContent = renderStructuredItems(entries);

    if (structuredContent) {
      sections.push("", "## 采集结果", "", structuredContent);
    }
  }

  fs.writeFileSync(outputFile, `${sections.join("\n").trim()}\n`, "utf-8");
  return outputFile;
}

module.exports = {
  saveExtractedContent,
};
