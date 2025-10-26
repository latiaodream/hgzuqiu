# 数据库迁移说明

## 概述

本目录包含所有数据库迁移脚本。迁移脚本按顺序执行，确保数据库结构与代码保持一致。

## 迁移脚本列表

### 核心表结构

1. **001_initial_schema.sql** - 初始数据库结构
   - users 表（用户表）
   - groups 表（分组表）
   - crown_accounts 表（皇冠账号表）
   - matches 表（赛事表）
   - bets 表（下注记录表）
   - coin_transactions 表（金币流水表）
   - settings 表（系统设置表）

2. **002_alter_crown_accounts_add_fields.sql** - 扩展皇冠账号表字段
   - original_username（原始用户名）
   - initialized_username（初始化后用户名）
   - agent_id（代理ID）
   - use_for_fetch（是否用于抓取）

3. **create_account_shares.sql** - 创建账号共享表
   - 用于账号共享功能
   - 记录账号所有者和共享对象的关系

4. **create_account_history.sql** - 创建账户历史数据表
   - 用于存储每日历史数据
   - 支持定时任务同步功能

5. **add_api_session_fields.sql** - 添加API会话字段
   - api_uid（API登录UID）
   - api_login_time（API登录时间）

6. **add_api_cookies_field.sql** - 添加API Cookies字段
   - api_cookies（API登录Cookie）

## 执行迁移

### 方法1：使用迁移脚本（推荐）

```bash
cd backend
node migrate.js
```

这个脚本会：
- 自动检测已执行的迁移
- 按顺序执行未执行的迁移
- 记录迁移历史到 `_migrations` 表

### 方法2：手动执行SQL

如果需要手动执行某个迁移脚本：

```bash
# 设置数据库连接信息
export PGPASSWORD=your_password

# 执行迁移脚本
psql -h localhost -p 5432 -U your_user -d your_database -f database/migrations/001_initial_schema.sql
```

## 生产环境部署

### 首次部署

1. 确保 PostgreSQL 已安装并运行
2. 创建数据库和用户
3. 执行所有迁移脚本

```bash
# 创建数据库
createdb -h localhost -p 5432 -U postgres your_database

# 执行迁移
cd backend
node migrate.js
```

### 更新部署

当代码更新后，如果有新的迁移脚本：

```bash
cd /www/wwwroot/aibcbot.top
git pull origin main
cd backend
node migrate.js
```

## 服务器快速修复

如果服务器上缺少某些表，可以手动执行以下SQL：

### 创建 account_shares 表

```bash
PGPASSWORD=your_password psql -h 127.0.0.1 -p 5432 -U your_user -d your_database << 'EOF'
CREATE TABLE IF NOT EXISTS account_shares (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES crown_accounts(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, shared_to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_shares_account_id ON account_shares(account_id);
CREATE INDEX IF NOT EXISTS idx_account_shares_owner_user_id ON account_shares(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_shares_shared_to_user_id ON account_shares(shared_to_user_id);

COMMENT ON TABLE account_shares IS '账号共享关系表';
COMMENT ON COLUMN account_shares.account_id IS '被共享的账号ID';
COMMENT ON COLUMN account_shares.owner_user_id IS '账号所有者用户ID';
COMMENT ON COLUMN account_shares.shared_to_user_id IS '接收共享的用户ID';
EOF
```

### 创建 account_history 表

```bash
PGPASSWORD=your_password psql -h 127.0.0.1 -p 5432 -U your_user -d your_database << 'EOF'
CREATE TABLE IF NOT EXISTS account_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES crown_accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    day_of_week VARCHAR(10),
    bet_amount DECIMAL(10, 2) DEFAULT 0,
    valid_amount DECIMAL(10, 2) DEFAULT 0,
    win_loss DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_account_date UNIQUE(account_id, date)
);

CREATE INDEX IF NOT EXISTS idx_account_history_account_date ON account_history(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_account_history_date ON account_history(date DESC);

COMMENT ON TABLE account_history IS '账户历史数据表';
COMMENT ON COLUMN account_history.account_id IS '账号ID';
COMMENT ON COLUMN account_history.date IS '日期';
COMMENT ON COLUMN account_history.day_of_week IS '星期几';
COMMENT ON COLUMN account_history.bet_amount IS '投注金额';
COMMENT ON COLUMN account_history.valid_amount IS '有效金额';
COMMENT ON COLUMN account_history.win_loss IS '赢/输金额';
EOF
```

## 检查数据库状态

使用检查脚本验证数据库结构：

```bash
cd backend
node check-tables.js
```

这个脚本会显示：
- 所有表的列表
- 关键表的字段结构
- 数据统计信息

## 注意事项

1. **备份数据库**：在执行迁移前，务必备份生产数据库
2. **测试环境**：先在测试环境验证迁移脚本
3. **幂等性**：所有迁移脚本都使用 `IF NOT EXISTS`，可以安全地重复执行
4. **回滚**：如果迁移失败，可以从备份恢复数据库

## 故障排查

### 问题：表不存在

**症状**：API 返回 500 错误，日志显示 `relation "xxx" does not exist`

**解决方案**：
1. 检查缺少哪个表
2. 执行对应的迁移脚本
3. 重启后端服务

### 问题：字段不存在

**症状**：API 返回错误，日志显示 `column "xxx" does not exist`

**解决方案**：
1. 检查表结构：`\d table_name` (在 psql 中)
2. 执行对应的 ALTER TABLE 迁移脚本
3. 重启后端服务

### 问题：迁移脚本执行失败

**症状**：`node migrate.js` 报错

**解决方案**：
1. 检查数据库连接配置（.env 文件）
2. 检查数据库用户权限
3. 查看具体错误信息，手动修复
4. 清理 `_migrations` 表中的失败记录（如果需要）

## 联系支持

如有问题，请查看：
- 后端日志：`pm2 logs bclogin-backend`
- 数据库日志：PostgreSQL 日志文件
- 检查脚本：`node check-tables.js`

