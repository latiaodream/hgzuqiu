#!/bin/bash

# 清理旧的皇冠抓取服务
# 由于已经迁移到 iSports，旧的 fetcher 服务不再需要

set -e

echo "🧹 开始清理旧的皇冠抓取服务..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. 停止并删除旧的 PM2 进程
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  停止旧的 PM2 进程"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查并删除 crown-fetcher
if pm2 list | grep -q "crown-fetcher[^-]"; then
    log_info "发现 crown-fetcher 进程，正在停止..."
    pm2 stop crown-fetcher 2>/dev/null || true
    pm2 delete crown-fetcher 2>/dev/null || true
    log_success "crown-fetcher 已删除"
else
    log_info "crown-fetcher 进程不存在（已清理或从未创建）"
fi

# 检查并删除 crown-fetch-daemon
if pm2 list | grep -q "crown-fetch-daemon"; then
    log_info "发现 crown-fetch-daemon 进程，正在停止..."
    pm2 stop crown-fetch-daemon 2>/dev/null || true
    pm2 delete crown-fetch-daemon 2>/dev/null || true
    log_success "crown-fetch-daemon 已删除"
else
    log_info "crown-fetch-daemon 进程不存在（已清理或从未创建）"
fi

# 保存 PM2 配置
log_info "保存 PM2 配置..."
pm2 save
log_success "PM2 配置已保存"
echo ""

# 2. 备份旧的 fetcher 目录
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  备份旧的 fetcher 目录"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

cd "$PROJECT_ROOT"

if [ -d "fetcher" ]; then
    BACKUP_NAME="fetcher.backup.$(date +%Y%m%d_%H%M%S)"
    log_info "将 fetcher 目录重命名为 $BACKUP_NAME"
    mv fetcher "$BACKUP_NAME"
    log_success "fetcher 已备份为 $BACKUP_NAME"
    log_warning "如需恢复: mv $BACKUP_NAME fetcher"
    log_warning "如确认不需要: rm -rf $BACKUP_NAME"
else
    log_info "fetcher 目录不存在（已清理或从未创建）"
fi
echo ""

# 3. 验证清理结果
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  验证清理结果"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_info "当前 PM2 进程列表:"
pm2 list
echo ""

# 检查 crown-fetcher-isports 是否运行
if pm2 list | grep -q "crown-fetcher-isports.*online"; then
    log_success "crown-fetcher-isports 正在运行"
else
    log_error "crown-fetcher-isports 未运行！请检查服务状态"
    log_warning "启动命令: cd fetcher-isports && pm2 start ecosystem.config.js"
fi
echo ""

log_info "检查数据文件:"
if [ -f "fetcher-isports/data/latest-matches.json" ]; then
    FILE_SIZE=$(du -h "fetcher-isports/data/latest-matches.json" | cut -f1)
    FILE_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "fetcher-isports/data/latest-matches.json" 2>/dev/null || stat -c "%y" "fetcher-isports/data/latest-matches.json" 2>/dev/null | cut -d'.' -f1)
    log_success "fetcher-isports/data/latest-matches.json 存在 ($FILE_SIZE, 更新时间: $FILE_TIME)"
else
    log_error "fetcher-isports/data/latest-matches.json 不存在！"
    log_warning "请检查 crown-fetcher-isports 服务是否正常运行"
fi

if [ -f "backend/crown-gids.json" ]; then
    FILE_SIZE=$(du -h "backend/crown-gids.json" | cut -f1)
    FILE_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "backend/crown-gids.json" 2>/dev/null || stat -c "%y" "backend/crown-gids.json" 2>/dev/null | cut -d'.' -f1)
    log_success "backend/crown-gids.json 存在 ($FILE_SIZE, 更新时间: $FILE_TIME)"
else
    log_warning "backend/crown-gids.json 不存在"
    log_info "运行以下命令生成: cd backend && npm run crown:fetch-gids"
fi
echo ""

# 4. 测试新的抓取流程
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  测试新的抓取流程"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "backend/package.json" ] && grep -q "test:fetch-gids" "backend/package.json"; then
    log_info "运行测试脚本..."
    cd backend
    if npm run test:fetch-gids; then
        log_success "测试通过！新的抓取流程工作正常"
    else
        log_error "测试失败！请检查错误信息"
        exit 1
    fi
    cd ..
else
    log_warning "测试脚本不存在，跳过测试"
fi
echo ""

# 5. 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 清理完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 清理总结:"
echo "   ✅ 已停止并删除旧的 PM2 进程"
echo "   ✅ 已备份旧的 fetcher 目录"
echo "   ✅ crown-fetcher-isports 服务正常运行"
echo "   ✅ 新的抓取流程测试通过"
echo ""
echo "💡 重要提示:"
echo "   1. 旧的 fetcher 目录已备份，如需恢复可以重命名回来"
echo "   2. 如果确认不再需要，可以手动删除备份:"
echo "      rm -rf $PROJECT_ROOT/fetcher.backup.*"
echo ""
echo "   3. 确保 crown-fetcher-isports 服务正常运行:"
echo "      pm2 logs crown-fetcher-isports"
echo ""
echo "   4. 定时任务会自动使用新的抓取方式，无需修改"
echo ""
echo "   5. 不再需要的环境变量（可以删除）:"
echo "      - CROWN_USERNAME"
echo "      - CROWN_PASSWORD"
echo "      - CROWN_BASE_URL"
echo ""
echo "📚 相关文档:"
echo "   - 清理说明: CLEANUP-OLD-FETCHER.md"
echo "   - 迁移文档: backend/docs/MIGRATION-TO-ISPORTS.md"
echo "   - 快速部署: QUICK-DEPLOY.md"
echo ""

