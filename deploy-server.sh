#!/bin/bash

# 服务器部署脚本
# 用于更新代码、安装依赖、编译、重启服务

echo "🚀 开始部署到服务器..."
echo ""

# 1. 更新代码
echo "📋 步骤 1: 更新代码"
cd /www/wwwroot/aibcbot.top
git pull origin main
echo ""

# 2. 安装后端依赖
echo "📋 步骤 2: 安装后端依赖"
cd /www/wwwroot/aibcbot.top/backend
npm install
echo ""

# 3. 编译后端
echo "📋 步骤 3: 编译后端"
npm run build
echo ""

# 4. 检查 Redis 配置
echo "📋 步骤 4: 检查 Redis 配置"
if ! grep -q "REDIS_HOST" .env; then
  echo "添加 Redis 配置到 .env"
  echo "" >> .env
  echo "# Redis 配置" >> .env
  echo "REDIS_HOST=localhost" >> .env
  echo "REDIS_PORT=6379" >> .env
  echo "REDIS_PASSWORD=" >> .env
else
  echo "Redis 配置已存在"
fi
echo ""

# 5. 测试 Redis 连接
echo "📋 步骤 5: 测试 Redis 连接"
redis-cli ping
echo ""

# 6. 重启后端服务
echo "📋 步骤 6: 重启后端服务"
# 尝试多种方式找到 pm2
if command -v pm2 &> /dev/null; then
  pm2 restart bclogin-backend
elif [ -f /usr/local/bin/pm2 ]; then
  /usr/local/bin/pm2 restart bclogin-backend
elif [ -f ~/.nvm/versions/node/*/bin/pm2 ]; then
  ~/.nvm/versions/node/*/bin/pm2 restart bclogin-backend
else
  echo "❌ 找不到 pm2 命令"
  exit 1
fi
echo ""

# 7. 等待服务启动
echo "📋 步骤 7: 等待服务启动（3秒）"
sleep 3
echo ""

# 8. 查看日志
echo "📋 步骤 8: 查看最近日志"
if command -v pm2 &> /dev/null; then
  pm2 logs bclogin-backend --lines 20 --nostream | tail -20
elif [ -f /usr/local/bin/pm2 ]; then
  /usr/local/bin/pm2 logs bclogin-backend --lines 20 --nostream | tail -20
elif [ -f ~/.nvm/versions/node/*/bin/pm2 ]; then
  ~/.nvm/versions/node/*/bin/pm2 logs bclogin-backend --lines 20 --nostream | tail -20
fi
echo ""

# 9. 检查 Redis 缓存
echo "📋 步骤 9: 检查 Redis 缓存"
redis-cli KEYS "crown:more_markets:*" | head -10
echo ""

echo "✅ 部署完成！"
echo ""
echo "🔍 如何验证："
echo "1. 查看日志中是否有 '✅ Redis 连接成功'"
echo "2. 打开滚球页面，刷新几次"
echo "3. 运行: redis-cli KEYS 'crown:more_markets:*'"
echo "4. 应该能看到缓存键"

