#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function nowTag() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseJsonLine(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch (_err) {
      // keep trying
    }
  }
  return null;
}

function compactResult(result) {
  if (!result || typeof result !== "object") return null;
  return {
    success: Boolean(result.success),
    message: result.message || "",
    has_screenshot: Boolean(result.screenshot),
    screenshot: result.screenshot ? `[base64:${String(result.screenshot).length}]` : "",
    exit_code: result.exit_code,
    timestamp: result.timestamp,
    meta: result.meta || {},
  };
}

function tailText(text, n) {
  const s = String(text || "");
  if (s.length <= n) return s;
  return s.slice(s.length - n);
}

function runCase(rootDir, commandJson, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      [path.join(rootDir, "run-unified-task.js"), JSON.stringify(commandJson)],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          WEB_KEEP_OPEN: process.env.WEB_KEEP_OPEN || "0",
          WEB_MAX_DOMAIN_TABS: process.env.WEB_MAX_DOMAIN_TABS || "2",
          WEB_TASK_TIMEOUT_MS: String(timeoutMs),
        },
      }
    );

    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try {
        child.kill("SIGKILL");
      } catch (_err) {
        // ignore
      }
    }, timeoutMs + 5000);

    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });

    child.stderr.on("data", (buf) => {
      stderr += String(buf);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, killedByTimeout });
    });
  });
}

function detectHumanBlock(result) {
  const msg = String((result && result.message) || "");
  const hay = `${msg}\n${JSON.stringify((result && result.meta) || {})}`.toLowerCase();
  if (result && result.meta && result.meta.requires_human) return true;
  return /(登录|验证|captcha|风控|human verification|请先登录)/i.test(hay);
}

function checkExpectations(result, spec) {
  const text = `${result.message || ""}\n${JSON.stringify(result.meta || {})}`;

  const expectAny = Array.isArray(spec.expect_any) ? spec.expect_any : [];
  if (expectAny.length) {
    const hit = expectAny.some((k) => text.includes(k));
    if (!hit) {
      return { ok: false, reason: `expect_any 未命中: ${expectAny.join(", ")}` };
    }
  }

  const expectAll = Array.isArray(spec.expect_all) ? spec.expect_all : [];
  for (const key of expectAll) {
    if (!text.includes(key)) {
      return { ok: false, reason: `expect_all 缺失: ${key}` };
    }
  }

  return { ok: true, reason: "ok" };
}

function checkConsistency(result) {
  if (!result || !result.meta) {
    return { checked: false, ok: null, reason: "no-result-meta" };
  }

  const excerpt = String(result.meta.page_excerpt || "");
  if (!excerpt) {
    return { checked: false, ok: null, reason: "no-page-excerpt" };
  }

  const candidates = [];

  if (Array.isArray(result.meta.results)) {
    for (const item of result.meta.results.slice(0, 5)) {
      if (item && item.title) candidates.push(String(item.title));
      if (item && item.name) candidates.push(String(item.name));
    }
  }

  if (result.meta.latest_answer && result.meta.latest_answer.title) {
    candidates.push(String(result.meta.latest_answer.title));
  }

  if (result.meta.latest_post && result.meta.latest_post.title) {
    candidates.push(String(result.meta.latest_post.title));
  }

  if (!candidates.length) {
    return { checked: false, ok: null, reason: "no-candidate-text" };
  }

  const normalizedExcerpt = excerpt.replace(/\s+/g, "");

  for (const text of candidates) {
    const clean = String(text || "").replace(/\s+/g, "");
    if (!clean || clean.length < 4) continue;

    if (normalizedExcerpt.includes(clean)) {
      return { checked: true, ok: true, reason: "candidate-found-in-excerpt", matched: clean.slice(0, 40) };
    }

    const pieces = clean.split(/[|｜·,，。！？!?:：;；\-_/()（）\[\]【】]/).filter((x) => x.length >= 4);
    for (const p of pieces) {
      if (normalizedExcerpt.includes(p)) {
        return { checked: true, ok: true, reason: "candidate-piece-found-in-excerpt", matched: p.slice(0, 40) };
      }
    }
  }

  return { checked: true, ok: false, reason: "no-candidate-hit-in-excerpt" };
}

async function main() {
  const rootDir = path.resolve(__dirname, "../..");
  const casesPath = process.argv[2] || path.join(__dirname, "cases.json");
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));

  const outDir = path.join(__dirname, "reports", nowTag());
  ensureDir(outDir);

  const blockedSites = new Set();
  const records = [];

  for (const spec of cases) {
    const site = spec.command && spec.command.site;
    const id = spec.id || `${site || "case"}-${records.length + 1}`;
    const timeoutMs = Number(spec.timeout_sec || 180) * 1000;

    if (site && blockedSites.has(site)) {
      const rec = { id, site, status: "skipped", reason: `site blocked: ${site}` };
      records.push(rec);
      fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(rec, null, 2));
      continue;
    }

    const startedAt = Date.now();
    const proc = await runCase(rootDir, spec.command, timeoutMs);
    const durationMs = Date.now() - startedAt;
    const result = parseJsonLine(proc.stdout);

    const rec = {
      id,
      site,
      duration_ms: durationMs,
      status: "failed",
      reason: "unknown",
      command: spec.command,
      process: {
        code: proc.code,
        signal: proc.signal,
        killedByTimeout: proc.killedByTimeout,
      },
      stdout_len: String(proc.stdout || "").length,
      stderr_len: String(proc.stderr || "").length,
      stdout_tail: tailText(proc.stdout, 3000),
      stderr_tail: tailText(proc.stderr, 3000),
      parsed: compactResult(result),
    };

    if (!result) {
      rec.status = "failed";
      rec.reason = "stdout 无法解析 JSON";
    } else {
      const expect = checkExpectations(result, spec);
      const humanBlock = detectHumanBlock(result);
      const consistency = checkConsistency(result);
      rec.consistency = consistency;
      if (humanBlock && site) blockedSites.add(site);

      if (humanBlock) {
        rec.status = "skipped";
        rec.reason = `requires human: ${result.message || "登录/验证"}`;
      } else if (result.success && expect.ok) {
        rec.status = "passed";
        rec.reason = "ok";
      } else if (result.success && !expect.ok) {
        rec.status = "failed";
        rec.reason = expect.reason;
      } else {
        rec.status = "failed";
        rec.reason = result.message || expect.reason || "result.success=false";
      }

      if (result.screenshot) {
        try {
          const pngPath = path.join(outDir, `${id}.png`);
          fs.writeFileSync(pngPath, Buffer.from(String(result.screenshot), "base64"));
          rec.screenshot_file = pngPath;
          rec.screenshot_size = fs.statSync(pngPath).size;
        } catch (err) {
          rec.screenshot_error = String(err.message || err);
        }
      }

      const excerpt = String((result.meta && result.meta.page_excerpt) || "").slice(0, 600);
      if (excerpt) rec.page_excerpt = excerpt;
    }

    records.push(rec);
    fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(rec, null, 2));
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total: records.length,
    passed: records.filter((r) => r.status === "passed").length,
    failed: records.filter((r) => r.status === "failed").length,
    skipped: records.filter((r) => r.status === "skipped").length,
    blocked_sites: Array.from(blockedSites),
    out_dir: outDir,
    records,
  };

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  const consoleSummary = {
    generated_at: summary.generated_at,
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    blocked_sites: summary.blocked_sites,
    out_dir: summary.out_dir,
    failed_ids: records.filter((r) => r.status === "failed").map((r) => r.id),
    skipped_ids: records.filter((r) => r.status === "skipped").map((r) => r.id),
  };

  process.stdout.write(`${JSON.stringify(consoleSummary, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
