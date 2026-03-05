#!/bin/bash

echo "Testing task analysis..."
echo ""

node automation-web/run-agent-task.js "去小红书搜索 openclaw，返回前 3 篇文章的标题和内容" 2>&1 | head -50
