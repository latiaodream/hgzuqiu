#!/bin/bash

# 服务器更新脚本 - 限额自动获取功能
# 适用于服务器: 47.238.112.207
# 项目目录: /www/wwwroot/aibcbot.top
# 使用方法: bash server-update.sh

set -e  # 遇到错误立即退出

echo "=========================================="
echo "  服务器更新脚本 - 限额自动获取功能"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 服务器配置
PROJECT_ROOT="/www/wwwroot/aibcbot.top"
PM2_PATH="/www/server/nodejs/v22.18.0/bin/pm2"
PM2_APP_NAME="bclogin-backend"

# 检查是否在服务器上
if [ ! -d "$PROJECT_ROOT" ]; then
    echo -e "${RED}✗${NC} 错误: 项目目录不存在: $PROJECT_ROOT"
    echo "请确认是否在正确的服务器上执行此脚本"
    exit 1
fi

cd "$PROJECT_ROOT"
echo -e "${BLUE}📁 项目目录:${NC} $PROJECT_ROOT"
echo ""

# 步骤 1: 备份当前代码
echo "1️⃣  备份当前代码..."
BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP_FILE" backend frontend 2>/dev/null || true
if [ -f "$BACKUP_FILE" ]; then
    echo -e "${GREEN}✓${NC} 备份完成: $BACKUP_FILE"
else
    echo -e "${YELLOW}⚠${NC}  备份跳过"
fi

# 步骤 2: 检查 Git 状态
echo ""
echo "2️⃣  检查 Git 状态..."
if [ -d .git ]; then
    echo -e "${GREEN}✓${NC} Git 仓库存在"
    
    # 显示当前版本
    CURRENT_COMMIT=$(git log --oneline -1)
    echo -e "${BLUE}当前版本:${NC} $CURRENT_COMMIT"
else
    echo -e "${RED}✗${NC} 错误: 不是 Git 仓库"
    exit 1
fi

# 步骤 3: 拉取最新代码
echo ""
echo "3️⃣  拉取最新代码..."
git pull origin main
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 代码更新成功"
    
    # 显示新版本
    NEW_COMMIT=$(git log --oneline -1)
    echo -e "${BLUE}新版本:${NC} $NEW_COMMIT"
else
    echo -e "${RED}✗${NC} 代码更新失败"
    exit 1
fi

# 步骤 4: 更新后端
echo ""
echo "4️⃣  更新后端..."
cd backend

# 安装依赖
echo "   安装依赖..."
npm install --production
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 后端依赖安装成功"
else
    echo -e "${RED}✗${NC} 后端依赖安装失败"
    exit 1
fi

# 编译代码
echo "   编译代码..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 后端编译成功"
else
    echo -e "${RED}✗${NC} 后端编译失败"
    exit 1
fi

# 步骤 5: 重启后端服务
echo ""
echo "5️⃣  重启后端服务..."
if [ -f "$PM2_PATH" ]; then
    $PM2_PATH restart $PM2_APP_NAME
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} 后端服务重启成功"
        echo ""
        $PM2_PATH list
    else
        echo -e "${RED}✗${NC} 后端服务重启失败"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} PM2 未找到: $PM2_PATH"
    exit 1
fi

# 步骤 6: 更新前端
echo ""
echo "6️⃣  更新前端..."
cd ../frontend

# 安装依赖
echo "   安装依赖..."
npm install --production
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 前端依赖安装成功"
else
    echo -e "${YELLOW}⚠${NC}  前端依赖安装失败，继续..."
fi

# 构建前端
echo "   构建前端..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 前端构建成功"
else
    echo -e "${YELLOW}⚠${NC}  前端构建失败，继续..."
fi

# 步骤 7: 重启 Nginx
echo ""
echo "7️⃣  重启 Nginx..."
nginx -t
if [ $? -eq 0 ]; then
    nginx -s reload
    echo -e "${GREEN}✓${NC} Nginx 重启成功"
else
    echo -e "${YELLOW}⚠${NC}  Nginx 配置测试失败，跳过重启"
fi

# 步骤 8: 运行测试
echo ""
echo "8️⃣  运行功能测试..."
cd ../backend
node backend/test-fetch-limits.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 功能测试通过"
else
    echo -e "${YELLOW}⚠${NC}  功能测试失败，但更新已完成"
fi

# 步骤 9: 查看服务状态
echo ""
echo "9️⃣  查看服务状态..."
$PM2_PATH status

# 步骤 10: 查看最近日志
echo ""
echo "🔟 查看最近日志..."
$PM2_PATH logs $PM2_APP_NAME --lines 20 --nostream

# 完成
echo ""
echo "=========================================="
echo -e "${GREEN}✅ 服务器更新完成！${NC}"
echo "=========================================="
echo ""
echo "📋 更新内容:"
echo "  ✓ 新增账号时自动获取限额"
echo "  ✓ 编辑账号时手动获取限额"
echo "  ✓ 自动保存限额到数据库"
echo "  ✓ 友好的用户提示"
echo ""
echo "🌐 访问地址:"
echo "  https://aibcbot.top"
echo ""
echo "📊 服务状态:"
$PM2_PATH status | grep $PM2_APP_NAME
echo ""
echo "📚 相关文档:"
echo "  - 快速参考: QUICK_REFERENCE_LIMITS.md"
echo "  - 部署指南: DEPLOYMENT_GUIDE.md"
echo "  - 测试指南: TEST_FETCH_LIMITS.md"
echo ""
echo "🎉 现在可以使用新功能了！"
echo ""

