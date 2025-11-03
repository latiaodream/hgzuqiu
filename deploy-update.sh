#!/bin/bash

# 数据源整合功能更新脚本
# 使用方法: bash deploy-update.sh

set -e  # 遇到错误立即退出

echo "============================================================"
echo "🚀 开始更新数据源整合功能"
echo "============================================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="/www/wwwroot/aibcbot.top"
PM2_PATH="/www/server/nodejs/v22.18.0/bin/pm2"

# 检查是否在正确的目录
if [ ! -d "$PROJECT_ROOT" ]; then
    echo -e "${RED}❌ 项目目录不存在: $PROJECT_ROOT${NC}"
    echo "请修改脚本中的 PROJECT_ROOT 变量"
    exit 1
fi

# 1. 拉取最新代码
echo -e "${YELLOW}📥 步骤 1/6: 拉取最新代码...${NC}"
cd "$PROJECT_ROOT"
git pull origin main
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 代码拉取成功${NC}"
else
    echo -e "${RED}❌ 代码拉取失败${NC}"
    exit 1
fi
echo ""

# 2. 更新 fetcher-isports
echo -e "${YELLOW}🔄 步骤 2/6: 更新 fetcher-isports...${NC}"
cd "$PROJECT_ROOT/fetcher-isports"

echo "  - 安装依赖..."
npm install --production

echo "  - 编译代码..."
npm run build

echo "  - 重启服务..."
$PM2_PATH restart crown-fetcher-isports

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ fetcher-isports 更新成功${NC}"
else
    echo -e "${RED}❌ fetcher-isports 更新失败${NC}"
    exit 1
fi
echo ""

# 3. 更新前端
echo -e "${YELLOW}🎨 步骤 3/6: 更新前端...${NC}"
cd "$PROJECT_ROOT/frontend"

echo "  - 安装依赖..."
npm install --production

echo "  - 编译代码..."
npm run build

echo "  - 重启服务..."
$PM2_PATH restart bclogin-frontend

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 前端更新成功${NC}"
else
    echo -e "${RED}❌ 前端更新失败${NC}"
    exit 1
fi
echo ""

# 4. 抓取皇冠数据
echo -e "${YELLOW}📊 步骤 4/6: 抓取皇冠数据...${NC}"
cd "$PROJECT_ROOT/backend"
npm run crown:fetch-gids

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 皇冠数据抓取成功${NC}"
else
    echo -e "${YELLOW}⚠️  皇冠数据抓取失败（可能是网络问题，稍后会自动重试）${NC}"
fi
echo ""

# 5. 等待服务启动
echo -e "${YELLOW}⏳ 步骤 5/6: 等待服务启动...${NC}"
sleep 5
echo -e "${GREEN}✅ 服务已启动${NC}"
echo ""

# 6. 运行测试
echo -e "${YELLOW}🧪 步骤 6/6: 运行测试验证...${NC}"
cd "$PROJECT_ROOT/backend"
npm run test:data-source

echo ""
echo "============================================================"
echo -e "${GREEN}✅ 更新完成！${NC}"
echo "============================================================"
echo ""

# 显示服务状态
echo -e "${YELLOW}📊 服务状态:${NC}"
$PM2_PATH list

echo ""
echo -e "${YELLOW}💡 提示:${NC}"
echo "  1. 访问前端查看效果: https://aibcbot.top"
echo "  2. 查看 fetcher-isports 日志: $PM2_PATH logs crown-fetcher-isports"
echo "  3. 查看前端日志: $PM2_PATH logs bclogin-frontend"
echo "  4. 如有问题，查看文档: docs/DEPLOY-DATA-SOURCE-INTEGRATION.md"
echo ""

