#!/usr/bin/env node

"use strict";

const fs = require("fs");
const { runAgentTask } = require("./flows/orchestrator");
const { loadCapturedEntries } = require("./flows/finish/data-handler");
const { buildResultFilePath } = require("./shared/utils");

function writeJsonLine(obj) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function breakText(text, width = 72) {
  const normalized = normalizeInlineText(text);
  if (!normalized) {
    return [];
  }

  const lines = [];
  let current = "";

  for (const char of normalized) {
    current += char;
    const softBreak = current.length >= width && /[，。！？；：,.!?;:\s]/.test(char);
    const hardBreak = current.length >= width + 16;
    if (softBreak || hardBreak) {
      lines.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) {
    lines.push(current.trim());
  }

  return lines;
}

function wrapParagraph(text, width = 72) {
  return breakText(text, width).join("\n");
}

function wrapBullet(text, width = 68) {
  const lines = breakText(text, width);
  return lines
    .map((line, idx) => (idx === 0 ? `- ${line}` : `  ${line}`))
    .join("\n");
}

function splitIntoSentences(text) {
  const normalized = normalizeInlineText(text);
  if (!normalized) {
    return [];
  }

  const sentences = [];
  let current = "";

  for (const char of normalized) {
    current += char;
    if (/[。！？!?；;]/.test(char)) {
      sentences.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences;
}

function normalizeListMarkers(text) {
  return String(text || "")
    .replace(/；\s*([^：\n]{2,30}：)\s*(\d+[、.．])/g, "；\n$1\n$2")
    .replace(/([：:])\s*(\d+[、.．])/g, "$1\n$2")
    .replace(/\s+(\d+[、.．])(?=[^\d\s])/g, "\n$1")
    .replace(/\s+([-•])\s+/g, "\n$1 ");
}

function splitTrailingHeading(text) {
  const normalized = normalizeInlineText(text);
  const match = normalized.match(/^(.*?[；;])\s*([^；;。！？!?]{2,24}：)$/);
  if (!match) {
    return { main: normalized, heading: "" };
  }
  return {
    main: normalizeInlineText(match[1]),
    heading: normalizeInlineText(match[2]),
  };
}

function segmentParagraph(paragraph) {
  const expanded = normalizeListMarkers(paragraph)
    .split("\n")
    .map((line) => normalizeInlineText(line))
    .filter(Boolean);

  const output = [];

  for (const line of expanded) {
    const numbered = line.match(/^\d+[、.．]\s*(.*)$/);
    const bulleted = line.match(/^[-•]\s*(.*)$/);

    if (numbered) {
      const split = splitTrailingHeading(numbered[1]);
      if (split.main) {
        output.push(wrapBullet(split.main));
      }
      if (split.heading) {
        output.push(wrapParagraph(split.heading));
      }
      continue;
    }
    if (bulleted) {
      const split = splitTrailingHeading(bulleted[1]);
      if (split.main) {
        output.push(wrapBullet(split.main));
      }
      if (split.heading) {
        output.push(wrapParagraph(split.heading));
      }
      continue;
    }

    const sentences = splitIntoSentences(line);
    if (sentences.length <= 2 || line.length <= 140) {
      output.push(wrapParagraph(line));
      continue;
    }

    let buffer = [];
    let bufferLength = 0;
    for (const sentence of sentences) {
      buffer.push(sentence);
      bufferLength += sentence.length;
      if (buffer.length >= 2 || bufferLength >= 120) {
        output.push(wrapParagraph(buffer.join(" ")));
        buffer = [];
        bufferLength = 0;
      }
    }

    if (buffer.length > 0) {
      output.push(wrapParagraph(buffer.join(" ")));
    }
  }

  return output.filter(Boolean).join("\n\n");
}

function formatRichText(value) {
  const raw = String(value || "").replace(/\r/g, "").trim();
  if (!raw) {
    return "";
  }

  const paragraphs = raw
    .split(/\n{2,}/)
    .map((part) => part
      .split("\n")
      .map((line) => normalizeInlineText(line))
      .filter(Boolean)
      .join(" "))
    .filter(Boolean);

  return paragraphs.map((paragraph) => segmentParagraph(paragraph)).filter(Boolean).join("\n\n");
}

function truncateText(value, limit = 180) {
  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function formatTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch (_err) {
    return new Date(timestamp).toISOString();
  }
}

function compactInteraction(info = {}) {
  const parts = [];
  const likes = Number(info.liked_count);
  const comments = Number(info.comment_count);
  const collected = Number(info.collected_count);
  const shares = Number(info.share_count);

  if (likes > 0) parts.push(`${likes}赞`);
  if (comments > 0) parts.push(`${comments}评`);
  if (collected > 0) parts.push(`${collected}藏`);
  if (shares > 0) parts.push(`${shares}分享`);

  return parts.join("｜");
}

function collectDetailLinks(detail = {}) {
  const links = [];
  const detailUrl = normalizeInlineText(detail.detail_url || detail.share_info?.link || "");
  const videoStreams = detail.video?.media?.stream || {};
  const videoUrl = normalizeInlineText(
    videoStreams.h264?.[0]?.master_url
      || videoStreams.h265?.[0]?.master_url
      || ""
  );
  const imageUrl = normalizeInlineText(
    detail.image_list?.[0]?.url_default
      || detail.image_list?.[0]?.url_pre
      || detail.image_list?.[0]?.info_list?.[0]?.url
      || ""
  );

  [detailUrl, videoUrl, imageUrl].forEach((link) => {
    if (link && !links.includes(link)) {
      links.push(link);
    }
  });

  return links;
}

function renderDetailItem(detail, itemIndex) {
  if (!detail || typeof detail !== "object") {
    return "";
  }

  const title = normalizeInlineText(detail.title || `结果 ${itemIndex}`);
  const author = normalizeInlineText(detail.user?.nickname || detail.author || "未知作者");
  const summary = formatRichText(detail.desc || detail.content_summary || "");
  const interaction = compactInteraction(detail.interact_info);
  const publishTime = formatTimestamp(detail.time || detail.last_update_time);
  const noteType = normalizeInlineText(detail.type || "");
  const location = normalizeInlineText(detail.ip_location || "");
  const links = collectDetailLinks(detail);

  const lines = [`## ${itemIndex}. ${title}`, "", `- 作者：${author}`];

  if (noteType) {
    lines.push(`- 类型：${noteType}`);
  }

  if (publishTime) {
    lines.push(`- 时间：${publishTime}`);
  }

  if (location) {
    lines.push(`- 属地：${location}`);
  }

  if (interaction) {
    lines.push(`- 互动：${interaction}`);
  }

  if (summary) {
    lines.push("", "### 摘要", "", summary);
  }

  if (links.length > 0) {
    lines.push("", "### 链接", "");
    links.forEach((link) => lines.push(`- ${link}`));
  }

  return lines.join("\n");
}

function renderListItem(item, itemIndex) {
  if (!item || typeof item !== "object") {
    return "";
  }

  const title = normalizeInlineText(item.title || `结果 ${itemIndex}`);
  const author = normalizeInlineText(item.author || "未知作者");
  const summary = formatRichText(item.content_summary || "");
  const articleContent = formatRichText(item.article_content || "");
  const detailUrl = normalizeInlineText(item.detail_url || "");
  const likes = Number(item.likes) || 0;

  const lines = [`## ${itemIndex}. ${title}`, "", `- 作者：${author}`];

  if (likes > 0) {
    lines.push(`- 点赞：${likes}`);
  }

  if (detailUrl) {
    lines.push(`- 链接：${detailUrl}`);
  }

  if (summary) {
    lines.push("", "### 摘要", "", summary);
  }

  if (articleContent && normalizeInlineText(articleContent) !== normalizeInlineText(summary)) {
    lines.push("", "### 内容", "", articleContent);
  }

  return lines.join("\n");
}

function renderCaptureEntry(entry, itemIndex) {
  const parsed = entry?.parsed || {};

  if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    return parsed.items
      .map((item, offset) => renderListItem(item, itemIndex + offset))
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

  if (parsed.detail && typeof parsed.detail === "object") {
    return renderDetailItem(parsed.detail, itemIndex);
  }

  const fallback = truncateText(entry?.label || entry?.content || "");
  if (!fallback) {
    return "";
  }

  return [`## ${itemIndex}. ${fallback}`].join("\n");
}

function renderStructuredItems(entries) {
  const blocks = [];
  let itemIndex = 1;

  for (const entry of entries) {
    const block = renderCaptureEntry(entry, itemIndex);
    if (!block) {
      continue;
    }

    blocks.push(block);
    itemIndex += Array.isArray(entry?.parsed?.items) ? entry.parsed.items.length : 1;
  }

  return blocks.join("\n\n---\n\n").trim();
}

function saveExtractedContent(result) {
  const extractionFile = result.meta?.extraction_file;
  const conclusion = result.meta?.conclusion;

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

async function main() {
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
}

if (require.main === module) {
  main();
}

module.exports = {
  __internal: {
    renderStructuredItems,
    renderCaptureEntry,
    renderDetailItem,
    renderListItem,
    formatTimestamp,
    compactInteraction,
  },
};
