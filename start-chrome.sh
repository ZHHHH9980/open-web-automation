#!/bin/bash
# 启动 Chrome 用于自动化（使用配置文件）

CONFIG_FILE="automation-web/config/browser.json"

# 检查配置文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
  echo "配置文件不存在，首次使用需要配置"
  echo "运行: node automation-web/config/init-browser.js"
  exit 1
fi

# 读取配置
CHROME_PATH=$(node -p "require('./$CONFIG_FILE').chromePath")
PROFILE_PATH=$(node -p "require('./$CONFIG_FILE').profilePath")
CDP_URL=$(node -p "require('./$CONFIG_FILE').cdpUrl")
CDP_PORT=$(echo $CDP_URL | grep -oE '[0-9]+$')

echo "启动 Chrome..."
echo "CDP 端口: $CDP_PORT"
echo "Profile 路径: $PROFILE_PATH"
echo "Chrome 路径: $CHROME_PATH"

# Extract user data dir and profile directory
USER_DATA_DIR=$(dirname "$PROFILE_PATH")
PROFILE_DIR=$(basename "$PROFILE_PATH")

echo "User Data Dir: $USER_DATA_DIR"
echo "Profile Directory: $PROFILE_DIR"

"$CHROME_PATH" \
  --remote-debugging-port=$CDP_PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --profile-directory="$PROFILE_DIR" \
  > /dev/null 2>&1 &

echo "Chrome 已启动，PID: $!"
echo ""
echo "现在可以运行（通常直接跑任务就行）："
echo "  cd automation-web"
echo "  node run-agent-task.js \"打开闲鱼，搜索 iPhone\""

