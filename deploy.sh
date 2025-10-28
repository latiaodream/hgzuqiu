#!/bin/bash

# 部署脚本 - 自动部署到服务器
# 服务器: 47.238.112.207
# 用户: root
# 密码: latiao@2025

echo "=========================================="
echo "开始部署到服务器..."
echo "=========================================="

# 服务器信息
SERVER="root@47.238.112.207"
PROJECT_DIR="/www/wwwroot/aibcbot.top"

echo ""
echo "步骤 1/7: 拉取最新代码..."
ssh $SERVER << 'ENDSSH'
cd /www/wwwroot/aibcbot.top
echo "当前目录: $(pwd)"
git pull origin main
echo "✅ 代码拉取完成"
ENDSSH

echo ""
echo "步骤 2/7: 执行数据库迁移..."
ssh $SERVER << 'ENDSSH'
cd /www/wwwroot/aibcbot.top
PGPASSWORD=AbDN22pKhcsNnJSk psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -f backend/migrations/20251027_add_init_type.sql
echo "✅ 数据库迁移完成"
ENDSSH

echo ""
echo "步骤 3/7: 安装后端依赖..."
ssh $SERVER << 'ENDSSH'
cd /www/wwwroot/aibcbot.top/backend
npm install
echo "✅ 后端依赖安装完成"
ENDSSH

echo ""
echo "步骤 4/7: 构建后端..."
ssh $SERVER << 'ENDSSH'
cd /www/wwwroot/aibcbot.top/backend
npm run build
echo "✅ 后端构建完成"
ENDSSH

echo ""
echo "步骤 5/7: 重启后端服务..."
ssh $SERVER << 'ENDSSH'
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend
echo "✅ 后端服务重启完成"
ENDSSH

echo ""
echo "步骤 6/7: 构建前端..."
ssh $SERVER << 'ENDSSH'
cd /www/wwwroot/aibcbot.top/frontend
npm install
npm run build
echo "✅ 前端构建完成"
ENDSSH

echo ""
echo "步骤 7/7: 重启 Nginx..."
ssh $SERVER << 'ENDSSH'
nginx -s reload
echo "✅ Nginx 重启完成"
ENDSSH

echo ""
echo "=========================================="
echo "查看后端日志..."
echo "=========================================="
ssh $SERVER << 'ENDSSH'
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 20 --nostream
ENDSSH

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "访问地址: https://aibcbot.top"
echo "测试账号: zhuren / 123456"
echo ""

