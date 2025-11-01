#!/bin/bash

# iSportsAPI 独立抓取服务部署脚本

echo "============================================================"
echo "🚀 iSportsAPI 独立抓取服务部署"
echo "============================================================"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在 fetcher-isports 目录下运行此脚本"
    exit 1
fi

# 1. 安装依赖
echo "📦 安装依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi
echo "✅ 依赖安装成功"
echo ""

# 2. 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  .env 文件不存在，创建默认配置..."
    cat > .env << 'EOF'
ISPORTS_API_KEY=GvpziueL9ouzIJNj
DATA_DIR=./data
FULL_FETCH_INTERVAL=60000
CHANGES_INTERVAL=2000
EOF
    echo "✅ .env 文件创建成功"
else
    echo "✅ .env 文件已存在"
fi
echo ""

# 3. 创建数据目录
if [ ! -d "data" ]; then
    echo "📁 创建数据目录..."
    mkdir -p data
    echo "✅ 数据目录创建成功"
else
    echo "✅ 数据目录已存在"
fi
echo ""

# 4. 编译 TypeScript
echo "🔨 编译 TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ 编译失败"
    exit 1
fi
echo "✅ 编译成功"
echo ""

# 5. 检查 PM2
echo "🔍 检查 PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 未安装，尝试使用系统 PM2..."
    PM2_CMD="/www/server/nodejs/v22.18.0/bin/pm2"
    if [ ! -f "$PM2_CMD" ]; then
        echo "❌ 未找到 PM2，请先安装 PM2"
        echo "   npm install -g pm2"
        exit 1
    fi
else
    PM2_CMD="pm2"
fi
echo "✅ PM2 已找到: $PM2_CMD"
echo ""

# 6. 停止旧服务（如果存在）
echo "🛑 停止旧服务..."
$PM2_CMD stop crown-fetcher-isports 2>/dev/null || true
$PM2_CMD delete crown-fetcher-isports 2>/dev/null || true
echo "✅ 旧服务已停止"
echo ""

# 7. 启动新服务
echo "🚀 启动新服务..."
if [ -f "ecosystem.config.js" ]; then
    echo "   使用 ecosystem.config.js 配置文件启动..."
    $PM2_CMD start ecosystem.config.js
else
    echo "   使用默认配置启动..."
    $PM2_CMD start dist/index.js --name crown-fetcher-isports
fi

if [ $? -ne 0 ]; then
    echo "❌ 服务启动失败"
    exit 1
fi
echo "✅ 服务启动成功"
echo ""

# 8. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5
echo ""

# 9. 查看服务状态
echo "📊 服务状态："
$PM2_CMD status crown-fetcher-isports
echo ""

# 10. 查看日志
echo "📝 最近日志："
$PM2_CMD logs crown-fetcher-isports --lines 20 --nostream
echo ""

# 11. 检查数据文件
echo "📁 检查数据文件..."
if [ -f "data/latest-matches.json" ]; then
    MATCH_COUNT=$(cat data/latest-matches.json | grep -o '"gid"' | wc -l)
    echo "✅ 数据文件已生成，包含 $MATCH_COUNT 场比赛"
else
    echo "⚠️  数据文件尚未生成，请等待几秒后查看日志"
fi
echo ""

# 12. 保存 PM2 配置
echo "💾 保存 PM2 配置..."
$PM2_CMD save
echo "✅ PM2 配置已保存"
echo ""

echo "============================================================"
echo "✅ 部署完成！"
echo "============================================================"
echo ""
echo "📝 常用命令："
echo "   查看日志: $PM2_CMD logs crown-fetcher-isports"
echo "   查看状态: $PM2_CMD status"
echo "   重启服务: $PM2_CMD restart crown-fetcher-isports"
echo "   停止服务: $PM2_CMD stop crown-fetcher-isports"
echo ""
echo "📁 数据文件: $(pwd)/data/latest-matches.json"
echo ""
echo "🎯 下一步："
echo "   1. 查看日志确认服务正常运行"
echo "   2. 修改后端读取路径指向 fetcher-isports/data/latest-matches.json"
echo "   3. 重启后端服务"
echo "   4. 验证前端数据显示正常"
echo ""

