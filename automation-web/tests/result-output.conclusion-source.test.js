#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { saveExtractedContent } = require("../result-output/save-extracted-content");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("renders top-level conclusion generator in markdown output", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "owa-result-"));
  const extractionFile = path.join(tempDir, "extract.txt");
  fs.writeFileSync(extractionFile, "", "utf8");

  const result = {
    meta: {
      url: "https://www.zhihu.com/people/Khazix/posts",
      extraction_file: extractionFile,
      conclusion: null,
      conclusion_generator: {
        label: "OpenAI gpt-5.4",
        status: "failed",
        error: "invalid_api_key",
      },
    },
  };

  const outputFile = saveExtractedContent(result);
  const content = fs.readFileSync(outputFile, "utf8");

  assert.match(content, /## 总结来源/);
  assert.match(content, /OpenAI gpt-5\.4/);
  assert.match(content, /invalid_api_key/);
});
