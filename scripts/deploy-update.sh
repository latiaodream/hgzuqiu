#!/bin/bash

# 快速部署更新脚本
# 用于在已搭建好的服务器上快速更新代码

set -e  # 遇到错误立即退出

echo "🚀 开始部署更新..."

# 1. 拉取最新代码
echo "📥 拉取最新代码..."
git pull origin main

# 2. 更新后端
echo "🔧 更新后端..."
cd backend

# 安装/更新依赖
echo "📦 安装后端依赖..."
npm install

# 重启后端服务
echo "🔄 重启后端服务..."
pm2 restart bclogin-backend || pm2 start npm --name "bclogin-backend" -- start

cd ..

# 3. 更新前端
echo "🎨 更新前端..."
cd frontend

# 安装/更新依赖
echo "📦 安装前端依赖..."
npm install

# 构建前端
echo "🏗️  构建前端..."
npm run build

cd ..

# 4. 重载 Nginx（如果需要）
echo "🔄 重载 Nginx..."
sudo systemctl reload nginx || echo "⚠️  Nginx 重载失败，请手动检查"

# 5. 显示服务状态
echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 服务状态："
pm2 status

echo ""
echo "📝 查看后端日志："
echo "   pm2 logs bclogin-backend"
echo ""
echo "🌐 访问地址："
echo "   前端: http://your-domain.com"
echo "   后端: http://your-domain.com/api"

