#!/usr/bin/env node
"use strict";

const { runOpenClawTask } = require("./index");

function readStdin() {
  return new Promise((resolve, reject) => {
    let content = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      content += chunk;
    });
    process.stdin.on("end", () => resolve(content));
    process.stdin.on("error", reject);
  });
}

async function readInput() {
  const arg = process.argv[2];
  if (arg && arg.trim()) {
    return arg;
  }

  if (process.stdin.isTTY) {
    throw new Error("missing input: pass JSON string as argv[2] or pipe JSON via stdin");
  }

  const stdin = await readStdin();
  if (!stdin.trim()) {
    throw new Error("stdin input is empty");
  }
  return stdin;
}

function parseInput(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    throw new Error("input is empty");
  }

  if (text.startsWith("{")) {
    return JSON.parse(text);
  }

  return { prompt: text };
}

async function main() {
  try {
    const raw = await readInput();
    const input = parseInput(raw);
    const result = await runOpenClawTask(input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    process.stdout.write(`${JSON.stringify({
      status: "failed",
      success: false,
      message: `openclaw adapter failed: ${err.message || err}`,
      raw_error: String(err),
    })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
