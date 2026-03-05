"use strict";

/**
 * Generate conclusion from extracted data
 * Uses a dedicated prompt to analyze and summarize extracted content
 */
async function generateConclusion(extractedData, task, planner, opts = {}) {
  if (!extractedData || extractedData.length === 0) {
    return null;
  }

  const debug = opts.debugMode || false;

  // Build context from extracted data
  const dataContext = extractedData.map((item, idx) => {
    return `[${idx + 1}] ${item.label || "未命名"}:\n${item.content}\n${
      item.full_length > item.content.length
        ? `(内容已截断，完整长度: ${item.full_length} 字符)\n`
        : ""
    }`;
  }).join("\n---\n\n");

  const prompt = buildConclusionPrompt(task, dataContext, extractedData.length);

  if (debug) {
    process.stderr.write(`\n[conclusion] 生成总结...\n`);
    process.stderr.write(`[conclusion] 提取了 ${extractedData.length} 条内容\n`);
  }

  try {
    const decision = await planner.decide({
      task,
      url: "",
      candidates: [],
      history: [],
      extractedData: dataContext,
      conclusionMode: true,
    }, prompt);

    if (debug) {
      process.stderr.write(`[conclusion] 生成完成\n`);
    }

    return {
      summary: decision.summary || decision.result || "",
      links: decision.links || [],
      keyPoints: decision.key_points || [],
    };
  } catch (err) {
    if (debug) {
      process.stderr.write(`[conclusion] 生成失败: ${err.message}\n`);
    }
    return {
      summary: `总结生成失败: ${err.message}`,
      links: [],
      keyPoints: [],
    };
  }
}

function buildConclusionPrompt(task, dataContext, itemCount) {
  return `你是一个内容分析助手，需要对提取的内容进行总结和分析。

**用户任务**: ${task}

**提取的内容** (共 ${itemCount} 条):

${dataContext}

---

**你的任务**:
1. 仔细阅读所有提取的内容
2. 生成一份高质量的总结报告
3. 提取关键信息和要点
4. 如果内容中包含链接或引用，整理出来

**输出要求**:
- 返回 JSON 格式: {"action": "conclusion", "summary": "...", "key_points": [...], "links": [...]}
- summary: 200-500字的总结，包含：
  * 内容主题和核心观点
  * 各条内容的关键信息
  * 内容之间的关联或对比
  * 对用户任务的回答
- key_points: 3-5个关键要点（数组）
- links: 相关链接列表（如果有）

**注意**:
- 不要简单罗列，要有分析和归纳
- 突出与用户任务最相关的信息
- 如果内容被截断，说明这一点
- 保持客观，不要添加原文没有的信息

请生成总结:`;
}

module.exports = { generateConclusion };
