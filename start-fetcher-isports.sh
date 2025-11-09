#!/bin/bash

# 启动 crown-fetcher-isports 服务
# 这个服务负责从 iSportsAPI 抓取赛事数据

set -e

echo "🚀 启动 crown-fetcher-isports 服务..."
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

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# 检查 fetcher-isports 目录是否存在
if [ ! -d "$PROJECT_ROOT/fetcher-isports" ]; then
    log_error "fetcher-isports 目录不存在！"
    log_info "请确保项目结构正确"
    exit 1
fi

cd "$PROJECT_ROOT/fetcher-isports"

# 检查 ecosystem.config.js 是否存在
if [ ! -f "ecosystem.config.js" ]; then
    log_error "ecosystem.config.js 不存在！"
    exit 1
fi

# 检查 node_modules 是否存在
if [ ! -d "node_modules" ]; then
    log_warning "node_modules 不存在，正在安装依赖..."
    npm install
    log_success "依赖安装完成"
fi

# 检查环境变量
if [ ! -f ".env" ]; then
    log_warning ".env 文件不存在"
    log_info "请确保设置了 ISPORTS_API_KEY 环境变量"
fi

# 检查是否已经在运行
if pm2 list | grep -q "crown-fetcher-isports.*online"; then
    log_warning "crown-fetcher-isports 已经在运行"
    log_info "正在重启服务..."
    pm2 restart crown-fetcher-isports
    log_success "服务已重启"
else
    log_info "正在启动服务..."
    pm2 start ecosystem.config.js
    log_success "服务已启动"
fi

# 保存 PM2 配置
pm2 save

echo ""
log_success "crown-fetcher-isports 服务启动成功！"
echo ""

# 显示服务状态
log_info "服务状态:"
pm2 list | grep -E "crown-fetcher-isports|App name"

echo ""
log_info "查看日志:"
echo "   pm2 logs crown-fetcher-isports"
echo ""
log_info "停止服务:"
echo "   pm2 stop crown-fetcher-isports"
echo ""
log_info "重启服务:"
echo "   pm2 restart crown-fetcher-isports"
echo ""

# 等待几秒，让服务启动
log_info "等待服务启动..."
sleep 5

# 检查数据文件
if [ -f "data/latest-matches.json" ]; then
    FILE_SIZE=$(du -h "data/latest-matches.json" | cut -f1)
    FILE_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "data/latest-matches.json" 2>/dev/null || stat -c "%y" "data/latest-matches.json" 2>/dev/null | cut -d'.' -f1)
    log_success "数据文件存在: data/latest-matches.json ($FILE_SIZE, 更新时间: $FILE_TIME)"
    
    # 显示数据统计
    if command -v node &> /dev/null; then
        log_info "数据统计:"
        node -e "
        try {
            const data = require('./data/latest-matches.json');
            const matches = data.matches || [];
            const timestamp = data.timestamp || 0;
            const age = Date.now() - timestamp;
            const ageSeconds = Math.floor(age / 1000);
            
            console.log('   - 赛事总数: ' + matches.length);
            console.log('   - 数据年龄: ' + ageSeconds + ' 秒');
            
            if (ageSeconds > 300) {
                console.log('   ⚠️  数据可能过期（超过5分钟）');
            } else {
                console.log('   ✅ 数据新鲜');
            }
        } catch (error) {
            console.log('   ⚠️  无法读取数据文件');
        }
        "
    fi
else
    log_warning "数据文件不存在: data/latest-matches.json"
    log_info "服务启动后会自动生成数据文件"
fi

echo ""
log_info "💡 提示:"
echo "   - 服务会每 60 秒更新一次完整数据"
echo "   - 服务会每 2 秒更新一次赔率变化"
echo "   - 数据保存在: fetcher-isports/data/latest-matches.json"
echo ""

