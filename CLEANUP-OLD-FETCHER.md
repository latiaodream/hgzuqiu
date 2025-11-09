# 清理旧的皇冠抓取服务

## 📋 概述

由于已经迁移到 iSports，旧的皇冠抓取服务（`fetcher` 目录）不再需要，应该停止并删除。

## 🔍 检查现有进程

```bash
# 查看所有 PM2 进程
pm2 list

# 查找皇冠相关的进程
pm2 list | grep -i crown
pm2 list | grep -i fetch
```

可能存在的进程：
- `crown-fetcher` - 旧的皇冠抓取服务（使用皇冠API）
- `crown-fetcher-isports` - 新的 iSports 抓取服务（保留）
- `crown-fetch-daemon` - 定时抓取守护进程（如果存在）

## 🛑 停止旧的抓取服务

### 1. 停止 crown-fetcher（旧服务）

```bash
# 停止进程
pm2 stop crown-fetcher

# 删除进程
pm2 delete crown-fetcher

# 保存 PM2 配置
pm2 save
```

### 2. 停止 crown-fetch-daemon（如果存在）

```bash
# 停止进程
pm2 stop crown-fetch-daemon

# 删除进程
pm2 delete crown-fetch-daemon

# 保存 PM2 配置
pm2 save
```

### 3. 确认只保留 crown-fetcher-isports

```bash
# 查看进程列表
pm2 list

# 应该只看到 crown-fetcher-isports 在运行
# 其他皇冠相关的进程应该都已删除
```

## 🗑️ 清理旧的 fetcher 目录（可选）

**注意**：在删除之前，请确认不再需要旧的代码和数据。

### 方案 1：重命名备份（推荐）

```bash
cd /www/wwwroot/aibcbot.top

# 重命名为备份目录
mv fetcher fetcher.backup.$(date +%Y%m%d)

# 查看备份
ls -lh | grep fetcher
```

### 方案 2：完全删除（谨慎）

```bash
cd /www/wwwroot/aibcbot.top

# 删除整个 fetcher 目录
rm -rf fetcher

# 确认删除
ls -lh | grep fetcher
```

## 🔧 清理定时任务

### 检查是否有旧的定时任务

```bash
# 查看所有定时任务
crontab -l

# 查找皇冠相关的定时任务
crontab -l | grep -i crown
crontab -l | grep -i fetch
```

### 删除旧的定时任务（如果存在）

如果发现类似这样的任务：
```
*/10 * * * * cd /www/wwwroot/aibcbot.top/backend && npm run crown:fetch-gids
```

**不要删除**，因为这个任务现在已经改为从 fetcher-isports 读取数据了。

如果发现其他直接调用 `fetcher` 目录的任务，可以删除：

```bash
# 编辑 crontab
crontab -e

# 删除相关行，保存退出
```

## ✅ 验证清理结果

### 1. 检查 PM2 进程

```bash
pm2 list
```

**预期结果**：
```
┌─────┬──────────────────────────┬─────────┬─────────┬──────────┐
│ id  │ name                     │ status  │ restart │ uptime   │
├─────┼──────────────────────────┼─────────┼─────────┼──────────┤
│ 0   │ bclogin-backend          │ online  │ 0       │ 2h       │
│ 1   │ bclogin-frontend         │ online  │ 0       │ 2h       │
│ 2   │ crown-fetcher-isports    │ online  │ 0       │ 1h       │  ← 只保留这个
└─────┴──────────────────────────┴─────────┴─────────┴──────────┘
```

**不应该看到**：
- ❌ `crown-fetcher`
- ❌ `crown-fetch-daemon`

### 2. 检查数据文件

```bash
# 检查 fetcher-isports 数据文件（应该存在）
ls -lh /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json

# 检查 crown-gids.json（应该存在）
ls -lh /www/wwwroot/aibcbot.top/backend/crown-gids.json
```

### 3. 测试新的抓取流程

```bash
cd /www/wwwroot/aibcbot.top/backend

# 运行测试
npm run test:fetch-gids

# 运行抓取
npm run crown:fetch-gids
```

**预期输出**：
```
🔄 从 fetcher-isports 读取赛事数据...
💡 此脚本不再使用皇冠API，避免账号被封

✅ 从 fetcher-isports/data/latest-matches.json 读取数据成功

📊 赛事分类:
   - 滚球 (live): 45 场
   - 今日 (today): 120 场
   - 早盘 (early): 80 场
   - 总计: 245 场

✅ 已保存到: crown-gids.json
```

### 4. 检查前端

访问前端页面，确认赛事数据正常显示。

## 📝 一键清理脚本

创建一个清理脚本：

```bash
cat > /www/wwwroot/aibcbot.top/cleanup-old-fetcher.sh << 'EOF'
#!/bin/bash

echo "🧹 开始清理旧的皇冠抓取服务..."
echo ""

# 1. 停止并删除旧的 PM2 进程
echo "1️⃣ 停止旧的 PM2 进程..."

if pm2 list | grep -q "crown-fetcher[^-]"; then
    echo "   停止 crown-fetcher..."
    pm2 stop crown-fetcher 2>/dev/null || true
    pm2 delete crown-fetcher 2>/dev/null || true
    echo "   ✅ crown-fetcher 已删除"
else
    echo "   ℹ️  crown-fetcher 不存在"
fi

if pm2 list | grep -q "crown-fetch-daemon"; then
    echo "   停止 crown-fetch-daemon..."
    pm2 stop crown-fetch-daemon 2>/dev/null || true
    pm2 delete crown-fetch-daemon 2>/dev/null || true
    echo "   ✅ crown-fetch-daemon 已删除"
else
    echo "   ℹ️  crown-fetch-daemon 不存在"
fi

# 保存 PM2 配置
pm2 save
echo ""

# 2. 备份旧的 fetcher 目录
echo "2️⃣ 备份旧的 fetcher 目录..."
cd /www/wwwroot/aibcbot.top

if [ -d "fetcher" ]; then
    BACKUP_NAME="fetcher.backup.$(date +%Y%m%d_%H%M%S)"
    mv fetcher "$BACKUP_NAME"
    echo "   ✅ fetcher 已重命名为 $BACKUP_NAME"
else
    echo "   ℹ️  fetcher 目录不存在"
fi
echo ""

# 3. 验证清理结果
echo "3️⃣ 验证清理结果..."
echo ""
echo "📊 当前 PM2 进程列表:"
pm2 list
echo ""

echo "📂 检查数据文件:"
if [ -f "fetcher-isports/data/latest-matches.json" ]; then
    echo "   ✅ fetcher-isports/data/latest-matches.json 存在"
else
    echo "   ❌ fetcher-isports/data/latest-matches.json 不存在"
fi

if [ -f "backend/crown-gids.json" ]; then
    echo "   ✅ backend/crown-gids.json 存在"
else
    echo "   ⚠️  backend/crown-gids.json 不存在（运行 npm run crown:fetch-gids 生成）"
fi
echo ""

# 4. 测试新的抓取流程
echo "4️⃣ 测试新的抓取流程..."
cd backend
npm run test:fetch-gids

echo ""
echo "✅ 清理完成！"
echo ""
echo "💡 提示:"
echo "   - 旧的 fetcher 目录已备份，如需恢复可以重命名回来"
echo "   - 如果确认不再需要，可以手动删除备份: rm -rf /www/wwwroot/aibcbot.top/fetcher.backup.*"
echo "   - 确保 crown-fetcher-isports 服务正常运行: pm2 logs crown-fetcher-isports"
EOF

# 添加执行权限
chmod +x /www/wwwroot/aibcbot.top/cleanup-old-fetcher.sh

# 运行清理脚本
/www/wwwroot/aibcbot.top/cleanup-old-fetcher.sh
```

## 🔄 回滚方案（如果需要）

如果清理后发现问题，可以回滚：

```bash
cd /www/wwwroot/aibcbot.top

# 1. 恢复 fetcher 目录
mv fetcher.backup.* fetcher

# 2. 重启旧的服务
cd fetcher
pm2 start ecosystem.config.js

# 3. 保存配置
pm2 save
```

## 📚 相关文档

- [迁移文档](backend/docs/MIGRATION-TO-ISPORTS.md)
- [改动总结](MIGRATION-SUMMARY.md)
- [快速部署](QUICK-DEPLOY.md)

## ⚠️ 注意事项

1. **不要删除 fetcher-isports**
   - 这是新的抓取服务，必须保留
   - 确保它正常运行：`pm2 status crown-fetcher-isports`

2. **备份优先**
   - 建议先重命名备份，而不是直接删除
   - 确认系统运行正常后再删除备份

3. **定时任务**
   - 不要删除 `cron-update-mapping.sh` 相关的定时任务
   - 这个任务现在已经改为从 fetcher-isports 读取数据

4. **数据文件**
   - 确保 `fetcher-isports/data/latest-matches.json` 存在且更新
   - 确保 `backend/crown-gids.json` 能正常生成

## 🎯 总结

清理步骤：
1. ✅ 停止并删除 `crown-fetcher` 进程
2. ✅ 停止并删除 `crown-fetch-daemon` 进程（如果存在）
3. ✅ 备份或删除 `fetcher` 目录
4. ✅ 保留 `crown-fetcher-isports` 进程
5. ✅ 验证新的抓取流程正常工作

