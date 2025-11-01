#!/bin/bash

# 服务器完整更新和部署脚本
# 用于修复 msg: 100 误判问题和球队名称显示问题

set -e  # 遇到错误立即退出

echo "============================================================"
echo "🚀 服务器完整更新和部署"
echo "============================================================"
echo ""

# 1. 回到项目根目录
echo "📁 进入项目目录..."
cd /www/wwwroot/aibcbot.top
echo "✅ 当前目录: $(pwd)"
echo ""

# 2. 检查 git 状态
echo "🔍 检查 git 状态..."
git status
echo ""

# 3. 暂存 package 相关改动
echo "💾 暂存 package 相关改动..."
if git diff --name-only | grep -q "backend/package"; then
    echo "   发现 package 文件改动，暂存中..."
    git stash push -m "temp-package-update" backend/package.json backend/package-lock.json
    echo "✅ 已暂存 package 文件"
else
    echo "✅ 没有 package 文件改动"
fi
echo ""

# 4. 拉取最新代码
echo "📥 拉取最新代码..."
git pull --rebase origin main
if [ $? -ne 0 ]; then
    echo "❌ git pull 失败，请手动处理冲突"
    exit 1
fi
echo "✅ 代码拉取成功"
echo ""

# 5. 安装后端依赖
echo "📦 安装后端依赖..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi
echo "✅ 依赖安装成功"
echo ""

# 6. 编译后端
echo "🔨 编译后端..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ 后端编译失败"
    exit 1
fi
echo "✅ 后端编译成功"
echo ""

# 7. 抓取皇冠 GID
echo "🎯 抓取皇冠 GID..."
CROWN_USERNAME=pWtx91F0jC \
CROWN_PASSWORD=aa123123 \
CROWN_BASE_URL=https://hga038.com \
CROWN_GID_OUTPUT=/www/wwwroot/aibcbot.top/backend/crown-gids.json \
npm run crown:fetch-gids

if [ $? -ne 0 ]; then
    echo "❌ 抓取 GID 失败"
    exit 1
fi
echo "✅ GID 抓取成功"
echo ""

# 8. 构建映射表
echo "🗺️  构建映射表..."
ISPORTS_API_KEY=GvpziueL9ouzIJNj \
CROWN_GID_INPUT=/www/wwwroot/aibcbot.top/backend/crown-gids.json \
CROWN_MAP_OUTPUT=/www/wwwroot/aibcbot.top/fetcher-isports/data/crown-match-map.json \
npm run crown:build-map

if [ $? -ne 0 ]; then
    echo "❌ 构建映射表失败"
    exit 1
fi
echo "✅ 映射表构建成功"
echo ""

# 9. 编译 fetcher-isports
echo "🔨 编译 fetcher-isports..."
cd /www/wwwroot/aibcbot.top/fetcher-isports
npm run build
if [ $? -ne 0 ]; then
    echo "❌ fetcher-isports 编译失败"
    exit 1
fi
echo "✅ fetcher-isports 编译成功"
echo ""

# 10. 重启 fetcher-isports
echo "🔄 重启 fetcher-isports..."
/www/server/nodejs/v22.18.0/bin/pm2 restart crown-fetcher-isports
if [ $? -ne 0 ]; then
    echo "❌ fetcher-isports 重启失败"
    exit 1
fi
echo "✅ fetcher-isports 重启成功"
echo ""

# 11. 重启后端
echo "🔄 重启后端..."
cd /www/wwwroot/aibcbot.top/backend
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend
if [ $? -ne 0 ]; then
    echo "❌ 后端重启失败"
    exit 1
fi
echo "✅ 后端重启成功"
echo ""

# 12. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10
echo ""

# 13. 查看服务状态
echo "📊 服务状态："
/www/server/nodejs/v22.18.0/bin/pm2 status
echo ""

# 14. 查看 fetcher 日志
echo "📝 fetcher-isports 最近日志："
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --lines 30 --nostream
echo ""

# 15. 查看后端日志
echo "📝 后端最近日志："
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 20 --nostream
echo ""

echo "============================================================"
echo "✅ 部署完成！"
echo "============================================================"
echo ""
echo "📝 检查要点："
echo "   1. fetcher 日志中应该显示 '✅ 登录成功'"
echo "   2. fetcher 日志中不应该有 'msg: 100 误判' 错误"
echo "   3. 后端日志中应该显示 '✅ 使用独立抓取服务数据'"
echo "   4. 前端应该能正确显示球队名称"
echo ""
echo "🔍 如果还有问题，请查看完整日志："
echo "   /www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports"
echo "   /www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend"
echo ""

