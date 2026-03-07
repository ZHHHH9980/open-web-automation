"use strict";

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

module.exports = {
  normalizeInlineText,
  formatRichText,
  truncateText,
  formatTimestamp,
  __internal: {
    breakText,
    wrapParagraph,
    wrapBullet,
    splitIntoSentences,
    normalizeListMarkers,
    splitTrailingHeading,
    segmentParagraph,
  },
};
