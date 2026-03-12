#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { __internal } = require("../planners");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function withTempCodexConfig(configText, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "owa-codex-config-"));
  fs.writeFileSync(path.join(tempDir, "config.toml"), configText, "utf8");
  return fn(tempDir);
}

test("auto mode prefers direct OpenAI before Claude", () => {
  const order = __internal.getAutoPlannerBackends({
    OPENAI_API_KEY: "openai-key",
    ANTHROPIC_API_KEY: "anthropic-key",
  });

  assert.deepEqual(order, ["openai", "claude", "codex"]);
});

test("auto mode reuses local Codex provider for CRS_OAI_KEY", () => {
  withTempCodexConfig(`model_provider = "crs"

[model_providers.crs]
name = "crs"
base_url = "https://example.com/v1"
wire_api = "responses"
env_key = "CRS_OAI_KEY"
`, (codexHome) => {
    const order = __internal.getAutoPlannerBackends({
      CODEX_HOME: codexHome,
      CRS_OAI_KEY: "crs-openai-key",
      ANTHROPIC_API_KEY: "anthropic-key",
    });

    assert.deepEqual(order, ["codex", "claude"]);
  });
});

test("auto mode falls back to codex when no remote keys exist", () => {
  const order = __internal.getAutoPlannerBackends({});
  assert.deepEqual(order, ["codex"]);
});
