# 映射文件自动更新定时任务

## 📋 概述

为了保持皇冠-iSports映射文件的实时性，系统提供了自动更新定时任务。

## 🎯 功能

- **自动抓取**：每小时自动抓取最新的皇冠比赛列表
- **自动映射**：使用 iSportsAPI 和语言包自动生成映射文件
- **自动重启**：更新完成后自动重启 fetcher-isports 服务
- **日志记录**：所有操作都会记录到日志文件

## 🚀 安装定时任务

### 方法一：使用 npm 脚本（推荐）

```bash
cd /www/wwwroot/aibcbot.top/backend

# 安装定时任务
npm run cron:install
```

### 方法二：手动安装

```bash
cd /www/wwwroot/aibcbot.top/backend

# 给脚本添加执行权限
chmod +x scripts/cron-update-mapping.sh
chmod +x scripts/install-cron.sh

# 运行安装脚本
bash scripts/install-cron.sh
```

## 📊 定时任务配置

- **执行频率**：每小时的第5分钟（避免整点高峰）
- **Cron 表达式**：`5 * * * *`
- **执行脚本**：`/www/wwwroot/aibcbot.top/backend/scripts/cron-update-mapping.sh`

## 📝 查看日志

```bash
# 实时查看日志
tail -f /www/wwwroot/aibcbot.top/backend/logs/mapping-update.log

# 查看最近100行
tail -n 100 /www/wwwroot/aibcbot.top/backend/logs/mapping-update.log

# 查看今天的日志
grep "$(date '+%Y-%m-%d')" /www/wwwroot/aibcbot.top/backend/logs/mapping-update.log
```

## 🔧 手动执行

如果需要立即更新映射文件，可以手动执行：

```bash
cd /www/wwwroot/aibcbot.top/backend

# 方法一：使用 npm 脚本
npm run cron:update

# 方法二：直接执行脚本
bash scripts/cron-update-mapping.sh
```

## 🗑️ 卸载定时任务

```bash
cd /www/wwwroot/aibcbot.top/backend

# 使用 npm 脚本
npm run cron:uninstall

# 或手动卸载
bash scripts/uninstall-cron.sh
```

## 📋 查看定时任务状态

```bash
# 查看所有定时任务
crontab -l

# 只查看映射更新任务
crontab -l | grep cron-update-mapping
```

## 🔍 故障排查

### 问题 1：定时任务没有执行

**检查步骤**：

1. 确认定时任务已安装：
   ```bash
   crontab -l | grep cron-update-mapping
   ```

2. 检查脚本权限：
   ```bash
   ls -l /www/wwwroot/aibcbot.top/backend/scripts/cron-update-mapping.sh
   ```
   应该显示 `-rwxr-xr-x`（有执行权限）

3. 查看系统日志：
   ```bash
   grep CRON /var/log/syslog | grep cron-update-mapping
   ```

### 问题 2：脚本执行失败

**检查步骤**：

1. 查看错误日志：
   ```bash
   tail -n 50 /www/wwwroot/aibcbot.top/backend/logs/mapping-update.log
   ```

2. 手动执行脚本查看详细错误：
   ```bash
   bash -x /www/wwwroot/aibcbot.top/backend/scripts/cron-update-mapping.sh
   ```

3. 检查环境变量：
   ```bash
   # 确保 ISPORTS_API_KEY 已设置
   echo $ISPORTS_API_KEY
   ```

### 问题 3：服务重启失败

**检查步骤**：

1. 检查 PM2 服务状态：
   ```bash
   /www/server/nodejs/v22.18.0/bin/pm2 list
   ```

2. 查看 PM2 日志：
   ```bash
   /www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --lines 50
   ```

## 📈 监控建议

建议定期检查以下指标：

1. **映射成功率**：
   ```bash
   cd /www/wwwroot/aibcbot.top/backend
   npm run analyze:matching
   ```

2. **日志文件大小**：
   ```bash
   du -h /www/wwwroot/aibcbot.top/backend/logs/mapping-update.log
   ```

3. **最后更新时间**：
   ```bash
   ls -lh /www/wwwroot/aibcbot.top/fetcher-isports/data/crown-match-map.json
   ```

## 🎯 最佳实践

1. **定期检查日志**：每天查看一次日志，确保任务正常执行
2. **监控匹配率**：每周运行一次 `npm run analyze:matching` 检查匹配率
3. **备份映射文件**：定期备份 `crown-match-map.json`
4. **调整执行频率**：根据实际需求调整 cron 表达式

## 📚 相关命令

```bash
# 安装定时任务
npm run cron:install

# 卸载定时任务
npm run cron:uninstall

# 手动执行更新
npm run cron:update

# 查看定时任务
crontab -l

# 查看日志
tail -f logs/mapping-update.log

# 分析匹配率
npm run analyze:matching

# 诊断 iSports 数据
npm run diagnose:isports
```

## 🔗 相关文档

- [iSportsAPI 文档](../docs/language-pack-integration.md)
- [数据源整合文档](../docs/data-source-integration.md)
- [映射脚本文档](../scripts/map-crown-to-isports-v2.ts)

