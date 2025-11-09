#!/bin/bash

echo "🔍 检查服务器状态..."
echo ""

# 服务器信息
SERVER="root@aibcbot.top"
PROJECT_DIR="/www/wwwroot/aibcbot.top"

echo "📋 1. 检查 Git 状态"
ssh $SERVER "cd $PROJECT_DIR && git log --oneline -5"
echo ""

echo "📋 2. 检查 Redis 状态"
ssh $SERVER "redis-cli ping 2>&1 || echo 'Redis 未运行或未安装'"
echo ""

echo "📋 3. 检查 .env 配置"
ssh $SERVER "cd $PROJECT_DIR/backend && grep -E 'REDIS_' .env 2>&1 || echo '未找到 Redis 配置'"
echo ""

echo "📋 4. 检查 Redis 缓存"
ssh $SERVER "redis-cli KEYS 'crown:more_markets:*' 2>&1 | head -10"
echo ""

echo "📋 5. 检查后端日志（最近 30 行）"
ssh $SERVER "pm2 logs bclogin-backend --lines 30 --nostream 2>&1 | tail -30"
echo ""

echo "✅ 检查完成！"

