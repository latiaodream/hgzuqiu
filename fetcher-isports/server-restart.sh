#!/bin/bash

# 服务器快速重启脚本 - 用于修复 API Key 问题

echo "============================================================"
echo "🔧 修复 iSportsAPI 服务 - API Key 配置"
echo "============================================================"
echo ""

# PM2 路径
PM2_CMD="/www/server/nodejs/v22.18.0/bin/pm2"

# 1. 停止旧服务
echo "🛑 停止旧服务..."
$PM2_CMD stop crown-fetcher-isports 2>/dev/null || true
$PM2_CMD delete crown-fetcher-isports 2>/dev/null || true
echo "✅ 旧服务已停止"
echo ""

# 2. 使用 ecosystem.config.js 启动（包含正确的环境变量）
echo "🚀 使用新配置启动服务..."
if [ -f "ecosystem.config.js" ]; then
    $PM2_CMD start ecosystem.config.js
    echo "✅ 服务已启动（使用 ecosystem.config.js）"
else
    echo "❌ 未找到 ecosystem.config.js 文件"
    exit 1
fi
echo ""

# 3. 保存 PM2 配置
echo "💾 保存 PM2 配置..."
$PM2_CMD save
echo "✅ PM2 配置已保存"
echo ""

# 4. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5
echo ""

# 5. 查看服务状态
echo "📊 服务状态："
$PM2_CMD status crown-fetcher-isports
echo ""

# 6. 查看最近日志
echo "📝 最近日志（查看是否还有 API Key 错误）："
$PM2_CMD logs crown-fetcher-isports --lines 30 --nostream
echo ""

echo "============================================================"
echo "✅ 重启完成！"
echo "============================================================"
echo ""
echo "📝 如果还有问题，请检查："
echo "   1. API Key 是否正确: GvpziueL9ouzIJNj"
echo "   2. 查看完整日志: $PM2_CMD logs crown-fetcher-isports"
echo "   3. 检查环境变量: $PM2_CMD env crown-fetcher-isports"
echo ""

