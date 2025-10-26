#!/bin/bash

# 皇冠账户历史数据同步脚本
# 用于宝塔定时任务，每天凌晨2点执行
# 使用方法：在宝塔面板 -> 计划任务 -> Shell脚本
# 执行周期：每天 02:00
# 脚本内容：/bin/bash /www/wwwroot/bclogin-system/scripts/sync-history.sh

# 配置
PROJECT_DIR="/www/wwwroot/bclogin-system"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/sync-history-$(date +%Y%m%d).log"

# 数据库配置（从 .env 文件读取）
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="bclogin_system"
DB_USER="lt"
DB_PASSWORD="lt123456"

# API配置
API_URL="http://localhost:3001/api/crown-automation"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========================================="
log "开始同步昨天的历史数据"
log "========================================="

# 计算昨天的日期
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
log "同步日期: $YESTERDAY"

# 获取所有在线账号
log "正在查询在线账号..."
ACCOUNTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT id, username 
    FROM crown_accounts 
    WHERE is_enabled = true AND is_online = true
    ORDER BY id;
")

if [ -z "$ACCOUNTS" ]; then
    log "❌ 没有找到在线账号"
    exit 0
fi

# 统计
TOTAL_ACCOUNTS=$(echo "$ACCOUNTS" | wc -l)
SUCCESS_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0

log "找到 $TOTAL_ACCOUNTS 个在线账号"
log "-----------------------------------------"

# 遍历每个账号
while IFS='|' read -r ACCOUNT_ID ACCOUNT_USERNAME; do
    # 去除空格
    ACCOUNT_ID=$(echo $ACCOUNT_ID | xargs)
    ACCOUNT_USERNAME=$(echo $ACCOUNT_USERNAME | xargs)
    
    if [ -z "$ACCOUNT_ID" ]; then
        continue
    fi
    
    log "处理账号: $ACCOUNT_USERNAME (ID: $ACCOUNT_ID)"
    
    # 检查数据库中是否已有该日期的数据
    EXISTING=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
        SELECT COUNT(*) 
        FROM account_history 
        WHERE account_id = $ACCOUNT_ID AND date = '$YESTERDAY';
    " | xargs)
    
    if [ "$EXISTING" -gt 0 ]; then
        log "  ⏭️  跳过: 数据已存在"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
    fi
    
    # 调用API获取历史数据（这会自动保存到数据库）
    log "  📡 正在从API获取数据..."
    
    # 使用curl调用API（需要管理员token）
    # 注意：这里需要一个有效的JWT token
    # 你可以创建一个专门的系统token，或者直接调用内部方法
    
    # 方案1：直接操作数据库（推荐）
    # 从皇冠API获取数据并插入数据库
    # 这里我们使用Node.js脚本来完成
    
    # 调用Node.js脚本
    cd "$PROJECT_DIR/backend"
    NODE_RESULT=$(node -e "
        const { getCrownAutomation } = require('./dist/services/crown-automation');
        
        (async () => {
            try {
                const automation = getCrownAutomation();
                const result = await automation.getAccountHistory($ACCOUNT_ID, {
                    startDate: '$YESTERDAY',
                    endDate: '$YESTERDAY'
                });
                
                if (result.success && result.data && result.data.length > 0) {
                    console.log('SUCCESS');
                } else {
                    console.log('NO_DATA');
                }
            } catch (error) {
                console.log('ERROR:' + error.message);
            }
        })();
    " 2>&1)
    
    if echo "$NODE_RESULT" | grep -q "SUCCESS"; then
        log "  ✅ 同步成功"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif echo "$NODE_RESULT" | grep -q "NO_DATA"; then
        log "  ⚠️  无数据"
        SKIP_COUNT=$((SKIP_COUNT + 1))
    else
        log "  ❌ 同步失败: $NODE_RESULT"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    
    # 延迟2秒，避免请求过快
    sleep 2
    
done <<< "$ACCOUNTS"

log "-----------------------------------------"
log "同步完成！"
log "总账号数: $TOTAL_ACCOUNTS"
log "成功: $SUCCESS_COUNT"
log "跳过: $SKIP_COUNT"
log "失败: $FAIL_COUNT"
log "========================================="

# 清理7天前的日志
find "$LOG_DIR" -name "sync-history-*.log" -mtime +7 -delete

exit 0

