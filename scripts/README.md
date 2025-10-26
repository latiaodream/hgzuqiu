# 皇冠账户历史数据同步脚本

## 功能说明

每天自动同步所有在线账号的昨天历史数据到数据库，用于快速查询和数据分析。

## 为什么不显示当天数据？

因为当天的数据会不断变化（用户持续投注），所以只同步和显示**昨天及之前的历史数据**，确保数据的稳定性和准确性。

---

## 方案选择

提供了3个脚本，推荐使用 **方案3（最简单）**：

### 方案1：Node.js脚本（需要编译）
- 文件：`scripts/sync-history.js`
- 优点：功能完整，日志详细
- 缺点：需要先编译TypeScript代码
- 适用：开发环境

### 方案2：Shell脚本（复杂）
- 文件：`scripts/sync-history-simple.sh`
- 优点：不依赖Node.js
- 缺点：实现复杂，可能有兼容性问题
- 适用：特殊环境

### 方案3：Shell + API（推荐）⭐
- 文件：`scripts/sync-history-curl.sh`
- 优点：简单可靠，直接调用现有API
- 缺点：需要管理员账号密码
- 适用：生产环境（宝塔面板）

---

## 宝塔面板设置方法（推荐）

### 第一步：修改配置

编辑 `scripts/sync-history-curl.sh` 文件，修改以下配置：

```bash
# 项目路径（根据实际情况修改）
PROJECT_DIR="/www/wwwroot/bclogin-system"

# 数据库配置
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="bclogin_system"
DB_USER="lt"
DB_PASSWORD="lt123456"

# 管理员账号（用于获取JWT token）
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"  # ⚠️ 请修改为实际密码
```

### 第二步：设置执行权限

```bash
chmod +x /www/wwwroot/bclogin-system/scripts/sync-history-curl.sh
```

### 第三步：手动测试

```bash
bash /www/wwwroot/bclogin-system/scripts/sync-history-curl.sh
```

查看日志：
```bash
tail -f /www/wwwroot/bclogin-system/logs/sync-history-$(date +%Y%m%d).log
```

### 第四步：添加宝塔定时任务

1. 登录宝塔面板
2. 点击左侧菜单 **"计划任务"**
3. 点击 **"添加计划任务"**
4. 填写以下信息：
   - **任务类型**：Shell脚本
   - **任务名称**：同步皇冠历史数据
   - **执行周期**：每天 02:00
   - **脚本内容**：
     ```bash
     /bin/bash /www/wwwroot/bclogin-system/scripts/sync-history-curl.sh
     ```
5. 点击 **"提交"**

### 第五步：测试定时任务

在宝塔面板的计划任务列表中，找到刚才添加的任务，点击 **"执行"** 按钮进行测试。

---

## 工作流程

```
1. 脚本启动
   ↓
2. 计算昨天日期 (例如: 2025-10-24)
   ↓
3. 登录系统获取JWT token
   ↓
4. 查询数据库获取所有在线账号
   ↓
5. 遍历每个账号:
   ├─ 检查数据库是否已有昨天的数据
   ├─ 如果已存在 → 跳过
   └─ 如果不存在 → 调用API获取数据并保存
   ↓
6. 输出统计结果
   ↓
7. 清理7天前的日志文件
```

---

## 日志说明

### 日志位置
```
/www/wwwroot/bclogin-system/logs/sync-history-YYYYMMDD.log
```

### 日志示例
```
[2025-10-25 02:00:01] =========================================
[2025-10-25 02:00:01] 开始同步昨天的历史数据
[2025-10-25 02:00:01] =========================================
[2025-10-25 02:00:01] 同步日期: 2025-10-24
[2025-10-25 02:00:01] 正在登录获取token...
[2025-10-25 02:00:02] ✅ 登录成功
[2025-10-25 02:00:02] 正在查询在线账号...
[2025-10-25 02:00:02] 找到 12 个在线账号
[2025-10-25 02:00:02] -----------------------------------------
[2025-10-25 02:00:02] 处理账号: elrukeblnl8 (ID: 23)
[2025-10-25 02:00:02]   📡 正在调用API获取数据...
[2025-10-25 02:00:10]   ✅ 同步成功
[2025-10-25 02:00:12] 处理账号: 0TnQHLra61 (ID: 22)
[2025-10-25 02:00:12]   ⏭️  跳过: 数据已存在
...
[2025-10-25 02:05:30] -----------------------------------------
[2025-10-25 02:05:30] 同步完成！
[2025-10-25 02:05:30] 总账号数: 12
[2025-10-25 02:05:30] 成功: 10
[2025-10-25 02:05:30] 跳过: 2
[2025-10-25 02:05:30] 失败: 0
[2025-10-25 02:05:30] =========================================
```

---

## 常见问题

### Q1: 脚本执行失败，提示"登录失败"
**A:** 检查 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 是否正确。

### Q2: 脚本执行成功，但数据库没有数据
**A:** 可能是账号没有历史数据，或者皇冠API返回空数据。查看日志确认。

### Q3: 如何查看某个账号的同步状态？
**A:** 查询数据库：
```sql
SELECT * FROM account_history 
WHERE account_id = 23 
ORDER BY date DESC;
```

### Q4: 如何手动触发同步？
**A:** 直接运行脚本：
```bash
bash /www/wwwroot/bclogin-system/scripts/sync-history-curl.sh
```

### Q5: 日志文件太多怎么办？
**A:** 脚本会自动清理7天前的日志。也可以手动清理：
```bash
rm /www/wwwroot/bclogin-system/logs/sync-history-*.log
```

### Q6: 如何修改同步时间？
**A:** 在宝塔面板的计划任务中修改执行周期。

### Q7: 能否同步多天的数据？
**A:** 可以。修改脚本中的 `YESTERDAY` 变量，或者循环调用API。

---

## 数据库表结构

```sql
CREATE TABLE account_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES crown_accounts(id),
    date DATE NOT NULL,
    day_of_week VARCHAR(10),
    bet_amount DECIMAL(10, 2) DEFAULT 0,
    valid_amount DECIMAL(10, 2) DEFAULT 0,
    win_loss DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_account_date UNIQUE(account_id, date)
);
```

---

## 技术支持

如有问题，请查看：
1. 脚本日志：`/www/wwwroot/bclogin-system/logs/sync-history-*.log`
2. 后端日志：宝塔面板 -> 网站 -> 日志
3. 数据库日志：PostgreSQL日志

---

## 更新记录

- **2025-10-25**: 初始版本，支持每日自动同步昨天的历史数据

