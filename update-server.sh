#!/bin/bash

# 宝塔服务器更新脚本
# 项目目录: /www/wwwroot/aibcbot.top

echo "=========================================="
echo "🚀 开始更新 bclogin-system 项目"
echo "=========================================="

# 进入项目目录
cd /www/wwwroot/aibcbot.top || exit 1

echo ""
echo "📥 1. 拉取最新代码..."
git pull origin main

if [ $? -ne 0 ]; then
    echo "❌ Git 拉取失败！"
    exit 1
fi

echo ""
echo "✅ 代码拉取成功！"

# 更新 Fetcher 服务
echo ""
echo "=========================================="
echo "📦 2. 更新 Fetcher 服务"
echo "=========================================="
cd /www/wwwroot/aibcbot.top/fetcher || exit 1

echo "安装依赖..."
npm install

echo "编译 TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Fetcher 编译失败！"
    exit 1
fi

echo "重启 Fetcher 服务..."
pm2 restart fetcher

if [ $? -ne 0 ]; then
    echo "⚠️  PM2 重启失败，尝试启动..."
    pm2 start dist/index.js --name fetcher
fi

echo "✅ Fetcher 服务更新完成！"

# 更新后端服务
echo ""
echo "=========================================="
echo "📦 3. 更新后端服务"
echo "=========================================="
cd /www/wwwroot/aibcbot.top/backend || exit 1

echo "安装依赖..."
npm install

echo "重启后端服务..."
pm2 restart backend

if [ $? -ne 0 ]; then
    echo "⚠️  PM2 重启失败，尝试启动..."
    pm2 start src/app.ts --name backend --interpreter ts-node
fi

echo "✅ 后端服务更新完成！"

# 更新前端
echo ""
echo "=========================================="
echo "📦 4. 更新前端"
echo "=========================================="
cd /www/wwwroot/aibcbot.top/frontend || exit 1

echo "安装依赖..."
npm install

echo "构建前端..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 前端构建失败！"
    exit 1
fi

echo "✅ 前端构建完成！"

# 显示服务状态
echo ""
echo "=========================================="
echo "📊 5. 检查服务状态"
echo "=========================================="
pm2 list

echo ""
echo "=========================================="
echo "✅ 更新完成！"
echo "=========================================="
echo ""
echo "📝 本次更新内容："
echo "  1. 前端：优化账号创建错误提示"
echo "  2. Fetcher：添加角球盘口支持"
echo "  3. Fetcher：球队名称改为简体中文"
echo "  4. Fetcher：优化更新频率（滚球2s，今日10s，早盘1h）"
echo "  5. 文档：添加多盘口功能文档"
echo ""
echo "🔍 查看日志："
echo "  - Fetcher: pm2 logs fetcher"
echo "  - Backend: pm2 logs backend"
echo ""

