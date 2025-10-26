#!/bin/bash

###############################################################################
# 皇冠账户历史数据同步脚本（最简版 - 使用API）
# 
# 【宝塔面板设置方法】
# 1. 登录宝塔面板
# 2. 点击左侧菜单 "计划任务"
# 3. 点击 "添加计划任务"
# 4. 填写以下信息：
#    - 任务类型：Shell脚本
#    - 任务名称：同步皇冠历史数据
#    - 执行周期：每天 02:00
#    - 脚本内容（复制下面这行）：
#      /bin/bash /www/wwwroot/bclogin-system/scripts/sync-history-curl.sh
# 5. 点击 "提交"
#
# 【手动测试】
# bash /www/wwwroot/bclogin-system/scripts/sync-history-curl.sh
###############################################################################

# ==================== 配置区域（请根据实际情况修改） ====================

# 项目路径
PROJECT_DIR="/www/wwwroot/bclogin-system"

# 数据库配置
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="bclogin_system"
DB_USER="lt"
DB_PASSWORD="lt123456"

# API配置
API_BASE_URL="http://localhost:3001/api/crown-automation"

# 管理员账号（用于获取JWT token）
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"  # 请修改为实际密码

# 日志目录
LOG_DIR="$PROJECT_DIR/logs"

# ========================================================================

# 创建日志目录
mkdir -p "$LOG_DIR"

# 日志文件
LOG_FILE="$LOG_DIR/sync-history-$(date +%Y%m%d).log"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 开始
log "========================================="
log "开始同步昨天的历史数据"
log "========================================="

# 计算昨天的日期
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)
log "同步日期: $YESTERDAY"

# 步骤1：登录获取JWT token
log "正在登录获取token..."
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")

# 提取token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    log "❌ 登录失败，无法获取token"
    log "响应: $LOGIN_RESPONSE"
    exit 1
fi

log "✅ 登录成功"

# 步骤2：获取所有在线账号
log "正在查询在线账号..."
ACCOUNT_IDS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A -c "
    SELECT id 
    FROM crown_accounts 
    WHERE is_enabled = true AND is_online = true
    ORDER BY id;
")

if [ -z "$ACCOUNT_IDS" ]; then
    log "❌ 没有找到在线账号"
    exit 0
fi

# 统计
TOTAL_ACCOUNTS=$(echo "$ACCOUNT_IDS" | wc -l | xargs)
SUCCESS_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0

log "找到 $TOTAL_ACCOUNTS 个在线账号"
log "-----------------------------------------"

# 步骤3：遍历每个账号，调用API
for ACCOUNT_ID in $ACCOUNT_IDS; do
    ACCOUNT_ID=$(echo $ACCOUNT_ID | xargs)
    
    if [ -z "$ACCOUNT_ID" ]; then
        continue
    fi
    
    # 获取账号用户名
    ACCOUNT_USERNAME=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A -c "
        SELECT username FROM crown_accounts WHERE id = $ACCOUNT_ID;
    " | xargs)
    
    log "处理账号: $ACCOUNT_USERNAME (ID: $ACCOUNT_ID)"
    
    # 检查数据库中是否已有数据
    EXISTING=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A -c "
        SELECT COUNT(*) 
        FROM account_history 
        WHERE account_id = $ACCOUNT_ID AND date = '$YESTERDAY';
    " | xargs)
    
    if [ "$EXISTING" -gt 0 ]; then
        log "  ⏭️  跳过: 数据已存在"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
    fi
    
    # 调用API获取历史数据
    log "  📡 正在调用API获取数据..."
    
    API_RESPONSE=$(curl -s -X GET \
        "${API_BASE_URL}/history/${ACCOUNT_ID}?startDate=${YESTERDAY}&endDate=${YESTERDAY}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json")
    
    # 检查响应
    if echo "$API_RESPONSE" | grep -q '"success":true'; then
        # 检查是否有数据
        DATA_COUNT=$(echo "$API_RESPONSE" | grep -o '"data":\[' | wc -l)
        if [ "$DATA_COUNT" -gt 0 ]; then
            log "  ✅ 同步成功"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            log "  ⚠️  无数据"
            SKIP_COUNT=$((SKIP_COUNT + 1))
        fi
    else
        log "  ❌ 同步失败"
        log "  响应: $(echo $API_RESPONSE | head -c 200)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    
    # 延迟2秒，避免请求过快
    sleep 2
    
done

log "-----------------------------------------"
log "同步完成！"
log "总账号数: $TOTAL_ACCOUNTS"
log "成功: $SUCCESS_COUNT"
log "跳过: $SKIP_COUNT"
log "失败: $FAIL_COUNT"
log "========================================="

# 清理7天前的日志
find "$LOG_DIR" -name "sync-history-*.log" -mtime +7 -delete 2>/dev/null

exit 0

