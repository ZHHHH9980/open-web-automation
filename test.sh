#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/automation-web"

if [[ ! -f "$APP_DIR/launcher.js" ]]; then
  echo "[test] 未找到 launcher.js: $APP_DIR/launcher.js" >&2
  exit 1
fi

if [[ -z "${OWA_AGENT_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
  echo "[test] 缺少 OpenAI API Key。请先设置 OWA_AGENT_API_KEY 或 OPENAI_API_KEY。" >&2
  echo "[test] 例如：export OPENAI_API_KEY=sk-..." >&2
  exit 1
fi

export OWA_AGENT_BACKEND="openai"
export OWA_AGENT_MODEL="${OWA_AGENT_MODEL:-gpt-5.4}"
export OWA_AGENT_PROGRESS="${OWA_AGENT_PROGRESS:-1}"
export WEB_CDP_AUTO_LAUNCH="${WEB_CDP_AUTO_LAUNCH:-1}"
export WEB_KEEP_OPEN="${WEB_KEEP_OPEN:-0}"

TASK="${*:-在知乎搜索 AI Agent，整理前 3 条结果}"

echo "[test] backend=$OWA_AGENT_BACKEND"
echo "[test] model=$OWA_AGENT_MODEL"
echo "[test] task=$TASK"

echo "[test] cwd=$APP_DIR"
cd "$APP_DIR"
node launcher.js "$TASK"
