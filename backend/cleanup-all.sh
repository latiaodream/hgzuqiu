#!/bin/bash

# 清理脚本 - 删除所有 Playwright 相关和调试文件

echo "🧹 开始清理项目..."

cd /Users/lt/Documents/kaifa/bclogin-system/backend

# 1. 删除过时的 Markdown 文档（保留最新的迁移文档）
echo "📄 清理过时的文档..."
rm -f BET_FIX_ANALYSIS.md
rm -f CROWN_API_ANALYSIS.md
rm -f CROWN_API_COMPLETE_GUIDE.md
rm -f CROWN_BET_API_ANALYSIS.md
rm -f CROWN_INIT_OPTIMIZATION.md
rm -f FINAL_REPORT.md
rm -f IMPLEMENTATION_SUMMARY.md
rm -f INIT_ACCOUNT_GUIDE.md
rm -f PURE_API_BETTING_README.md
rm -f QUICK_FIX.md
rm -f README_API_BETTING.md
rm -f capture-bet-simple.md

# 2. 删除调试 JSON 文件
echo "🗑️ 清理调试 JSON 文件..."
rm -f BET_API_CAPTURE.json
rm -f BET_REQUESTS_DETAILED.json
rm -f BET_REQUESTS_ONLY.json

# 3. 删除调试 XML 文件
echo "🗑️ 清理调试 XML 文件..."
rm -f matches-latest.xml

# 4. 删除测试脚本（用户已手动清空）
echo "🗑️ 清理测试脚本..."
rm -f test-bet-live.ts
rm -f test-bet-browser.ts
rm -f test-fetch-matches.ts

# 5. 删除 server.pid（如果存在）
echo "🗑️ 清理 PID 文件..."
rm -f server.pid

# 6. 检查是否还有其他调试文件
echo "🔍 检查其他调试文件..."
if ls *.log 1> /dev/null 2>&1; then
    echo "  发现 .log 文件，删除中..."
    rm -f *.log
fi

if ls *.png 1> /dev/null 2>&1; then
    echo "  发现 .png 文件，删除中..."
    rm -f *.png
fi

if ls *.html 1> /dev/null 2>&1; then
    echo "  发现 .html 文件，删除中..."
    rm -f *.html
fi

# 7. 清理编译目录
if [ -d "dist" ]; then
    echo "🗑️ 清理编译目录..."
    rm -rf dist
fi

# 8. 清理测试截图目录
if [ -d "test-screenshots" ]; then
    echo "🗑️ 清理测试截图目录..."
    rm -rf test-screenshots
fi

if [ -d "test-screenshots-full" ]; then
    rm -rf test-screenshots-full
fi

if [ -d "test-screenshots-pwd" ]; then
    rm -rf test-screenshots-pwd
fi

echo ""
echo "✅ 清理完成！"
echo ""
echo "📊 保留的文件："
echo "  - CLEANUP_GUIDE.md (清理指南)"
echo "  - MIGRATION_COMPLETE.md (迁移完成报告)"
echo "  - ensure-admin.js (管理员初始化脚本)"
echo "  - migrate.js (数据库迁移脚本)"
echo "  - package.json, tsconfig.json (配置文件)"
echo "  - src/ (源代码目录)"
echo "  - migrations/ (数据库迁移文件)"
echo ""
echo "🎉 项目已清理完毕，可以安全使用！"

