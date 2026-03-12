"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function stripQuotes(value) {
  const text = String(value || "").trim();
  const match = text.match(/^"([\s\S]*)"$/);
  return match ? match[1] : text;
}

function parseCodexToml(raw) {
  const root = {};
  const providers = {};
  let section = "";

  for (const line of String(raw || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    const kvMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim();
    const value = stripQuotes(kvMatch[2].split(/\s+#/, 1)[0]);

    if (section === "") {
      root[key] = value;
      continue;
    }

    const providerMatch = section.match(/^model_providers\.([A-Za-z0-9_-]+)$/);
    if (providerMatch) {
      const providerName = providerMatch[1];
      if (!providers[providerName]) providers[providerName] = {};
      providers[providerName][key] = value;
    }
  }

  return { root, providers };
}

function getCodexConfigPath(env = process.env) {
  const codexHome = String(env.CODEX_HOME || path.join(os.homedir(), ".codex")).trim();
  return path.join(codexHome, "config.toml");
}

function resolveLocalCodexProvider(env = process.env) {
  const configPath = getCodexConfigPath(env);
  if (!fs.existsSync(configPath)) return null;

  const parsed = parseCodexToml(fs.readFileSync(configPath, "utf8"));
  const providerKey = String(parsed.root.model_provider || "").trim();
  if (!providerKey) return null;

  const provider = parsed.providers[providerKey] || null;
  if (!provider) return null;

  const envKey = String(provider.env_key || "OPENAI_API_KEY").trim();
  const apiKey = String(env[envKey] || "").trim();
  const baseUrl = String(provider.base_url || "").trim();
  const wireApi = String(provider.wire_api || "chat_completions").trim().toLowerCase();

  return {
    config_path: configPath,
    provider_key: providerKey,
    name: String(provider.name || providerKey).trim(),
    env_key: envKey,
    has_api_key: Boolean(apiKey),
    base_url: baseUrl,
    wire_api: wireApi,
    requires_openai_auth: String(provider.requires_openai_auth || "false").trim() === "true",
  };
}

module.exports = {
  parseCodexToml,
  getCodexConfigPath,
  resolveLocalCodexProvider,
};
