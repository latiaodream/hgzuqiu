#!/bin/bash

# 限额自动获取功能 - 一键更新脚本
# 使用方法: bash update.sh

set -e  # 遇到错误立即退出

echo "=========================================="
echo "  限额自动获取功能 - 一键更新脚本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 获取项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "📁 项目目录: $PROJECT_ROOT"
echo ""

# 步骤 1: 检查 Git 状态
echo "1️⃣  检查 Git 状态..."
if [ -d .git ]; then
    echo -e "${GREEN}✓${NC} Git 仓库存在"
else
    echo -e "${RED}✗${NC} 错误: 不是 Git 仓库"
    exit 1
fi

# 检查是否有未提交的修改
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠${NC}  警告: 有未提交的修改"
    echo ""
    git status -s
    echo ""
    read -p "是否继续更新? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "更新已取消"
        exit 1
    fi
fi

# 步骤 2: 拉取最新代码
echo ""
echo "2️⃣  拉取最新代码..."
git pull origin main
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 代码更新成功"
else
    echo -e "${RED}✗${NC} 代码更新失败"
    exit 1
fi

# 步骤 3: 安装后端依赖
echo ""
echo "3️⃣  安装后端依赖..."
cd backend
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 后端依赖安装成功"
else
    echo -e "${RED}✗${NC} 后端依赖安装失败"
    exit 1
fi

# 步骤 4: 编译后端代码
echo ""
echo "4️⃣  编译后端代码..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 后端编译成功"
else
    echo -e "${RED}✗${NC} 后端编译失败"
    exit 1
fi

# 步骤 5: 安装前端依赖
echo ""
echo "5️⃣  安装前端依赖..."
cd ../frontend
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 前端依赖安装成功"
else
    echo -e "${RED}✗${NC} 前端依赖安装失败"
    exit 1
fi

# 步骤 6: 重启服务
echo ""
echo "6️⃣  重启服务..."
cd ..

# 检查是否使用 PM2
if command -v pm2 &> /dev/null; then
    echo "使用 PM2 重启服务..."
    pm2 restart all
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} 服务重启成功"
        echo ""
        pm2 list
    else
        echo -e "${RED}✗${NC} 服务重启失败"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠${NC}  未检测到 PM2，请手动重启服务"
    echo ""
    echo "手动重启命令:"
    echo "  终端 1: cd backend && npm run dev"
    echo "  终端 2: cd frontend && npm run dev"
fi

# 步骤 7: 运行测试
echo ""
echo "7️⃣  运行功能测试..."
cd backend
node backend/test-fetch-limits.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} 功能测试通过"
else
    echo -e "${YELLOW}⚠${NC}  功能测试失败，但更新已完成"
fi

# 完成
echo ""
echo "=========================================="
echo -e "${GREEN}✅ 更新完成！${NC}"
echo "=========================================="
echo ""
echo "📋 更新内容:"
echo "  ✓ 新增账号时自动获取限额"
echo "  ✓ 编辑账号时手动获取限额"
echo "  ✓ 自动保存限额到数据库"
echo "  ✓ 友好的用户提示"
echo ""
echo "📚 相关文档:"
echo "  - 快速参考: QUICK_REFERENCE_LIMITS.md"
echo "  - 部署指南: DEPLOYMENT_GUIDE.md"
echo "  - 测试指南: TEST_FETCH_LIMITS.md"
echo ""
echo "🎉 现在可以使用新功能了！"
echo ""

