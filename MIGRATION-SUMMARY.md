# 赛事抓取迁移到 iSports - 改动总结

## 📋 问题描述

之前系统使用皇冠API直接抓取赛事信息，导致抓取账号被封。

## ✅ 解决方案

将赛事抓取完全迁移到 iSportsAPI，不再直接调用皇冠API。

## 🔄 改动文件

### 1. `backend/scripts/fetch-crown-gids.ts` ⭐ 核心改动

**改动前**：
- 使用 `CrownApiClient` 登录皇冠账号
- 调用 `client.getGameList()` 抓取赛事
- 会导致账号被封

**改动后**：
- 从 `fetcher-isports/data/latest-matches.json` 读取数据
- 不再调用皇冠API
- 不会导致账号被封

### 2. `backend/scripts/cron-update-mapping.sh`

**改动**：
- 更新日志输出，说明不再直接调用皇冠API

### 3. 新增文件

- `backend/docs/MIGRATION-TO-ISPORTS.md` - 迁移文档
- `backend/scripts/test-fetch-gids.ts` - 测试脚本
- `MIGRATION-SUMMARY.md` - 本文件

### 4. `backend/package.json`

**新增脚本**：
```json
"test:fetch-gids": "ts-node scripts/test-fetch-gids.ts"
```

## 🚀 使用方法

### 1. 确保 fetcher-isports 服务运行

```bash
# 检查服务状态
pm2 status crown-fetcher-isports

# 如果未运行，启动服务
cd fetcher-isports
pm2 start ecosystem.config.js
```

### 2. 测试新的抓取脚本

```bash
cd backend

# 运行测试
npm run test:fetch-gids
```

**预期输出**：
```
🧪 测试 fetch-crown-gids 脚本

📂 检查 fetcher-isports 数据文件...
   ✅ 找到数据文件

📊 检查数据格式...
   - 数据时间: 2025-11-09 14:30:25
   - 数据年龄: 15 秒
   - 赛事总数: 245

🔍 检查赛事数据结构...
   - 有效赛事: 245
   - 滚球: 45
   - 今日: 120
   - 早盘: 80

✅ 测试通过！
```

### 3. 运行抓取脚本

```bash
cd backend

# 运行脚本（不再需要皇冠账号密码）
npm run crown:fetch-gids
```

**预期输出**：
```
🔄 从 fetcher-isports 读取赛事数据...
💡 此脚本不再使用皇冠API，避免账号被封

✅ 从 fetcher-isports/data/latest-matches.json 读取数据成功

📊 数据统计:
   - 赛事总数: 245

📊 赛事分类:
   - 滚球 (live): 45 场
   - 今日 (today): 120 场
   - 早盘 (early): 80 场
   - 总计: 245 场

✅ 已保存到: crown-gids.json

💡 提示: 此脚本现在从 fetcher-isports 读取数据，不会导致皇冠账号被封
```

## 📊 数据流程

### 改动前

```
皇冠账号 → 皇冠API → fetch-crown-gids.ts → crown-gids.json
                ↓
            账号被封 ❌
```

### 改动后

```
iSportsAPI → fetcher-isports → latest-matches.json
                                       ↓
                              fetch-crown-gids.ts → crown-gids.json
                                       ↓
                                  不会被封 ✅
```

## ✅ 优势

1. **不会被封号** - 不再直接调用皇冠API
2. **更稳定** - 使用专业的 iSportsAPI 服务
3. **更快速** - 直接读取本地文件
4. **更可靠** - fetcher-isports 持续运行，数据实时更新
5. **无需账号** - 不再需要皇冠账号密码

## 🔍 验证步骤

### 1. 检查 fetcher-isports 服务

```bash
pm2 status crown-fetcher-isports
pm2 logs crown-fetcher-isports --lines 20
```

### 2. 检查数据文件

```bash
# 检查文件是否存在
ls -lh fetcher-isports/data/latest-matches.json

# 查看文件内容（前20行）
head -n 20 fetcher-isports/data/latest-matches.json
```

### 3. 运行测试

```bash
cd backend
npm run test:fetch-gids
```

### 4. 运行抓取脚本

```bash
cd backend
npm run crown:fetch-gids
```

### 5. 检查输出文件

```bash
# 检查 crown-gids.json 是否生成
ls -lh backend/crown-gids.json

# 查看文件内容
cat backend/crown-gids.json | jq '.matchCount'
```

## 🔧 故障排查

### 问题 1：找不到数据文件

**错误**：
```
❌ 无法找到 fetcher-isports 的数据文件
```

**解决**：
```bash
# 启动 fetcher-isports 服务
cd fetcher-isports
pm2 start ecosystem.config.js

# 等待服务生成数据
sleep 120

# 重新运行
cd ../backend
npm run crown:fetch-gids
```

### 问题 2：数据过期

**警告**：
```
⚠️ 数据已过期 (15 分钟前)
```

**解决**：
```bash
# 检查服务日志
pm2 logs crown-fetcher-isports

# 重启服务
pm2 restart crown-fetcher-isports

# 等待服务恢复
sleep 120
```

### 问题 3：赛事数量为0

**解决**：
```bash
# 检查 iSportsAPI 是否正常
cd backend
npm run diagnose:isports

# 查看 fetcher-isports 日志
pm2 logs crown-fetcher-isports --lines 100
```

## 📝 环境变量

### 不再需要

- ~~`CROWN_USERNAME`~~ - 皇冠账号（已废弃）
- ~~`CROWN_PASSWORD`~~ - 皇冠密码（已废弃）
- ~~`CROWN_BASE_URL`~~ - 皇冠站点（已废弃）

### 仍然需要

- `ISPORTS_API_KEY` - iSportsAPI 密钥（fetcher-isports 使用）

## 🎯 部署步骤

### 1. 拉取最新代码

```bash
cd /www/wwwroot/aibcbot.top
git pull
```

### 2. 确保 fetcher-isports 运行

```bash
cd fetcher-isports
pm2 status crown-fetcher-isports

# 如果未运行
pm2 start ecosystem.config.js
```

### 3. 测试新脚本

```bash
cd backend
npm run test:fetch-gids
```

### 4. 运行一次抓取

```bash
npm run crown:fetch-gids
```

### 5. 验证定时任务

```bash
# 查看定时任务
crontab -l | grep cron-update-mapping

# 手动执行一次
npm run cron:update
```

## 📚 相关文档

- [迁移详细文档](backend/docs/MIGRATION-TO-ISPORTS.md)
- [iSportsAPI 文档](fetcher-isports/README.md)
- [定时任务文档](backend/docs/cron-mapping-updater.md)

## 🎉 总结

通过这次迁移，系统不再依赖皇冠API直接抓取赛事，彻底解决了账号被封的问题。所有赛事数据现在都通过 iSportsAPI 获取，更加稳定可靠。

**关键改动**：
- ✅ `fetch-crown-gids.ts` 不再调用皇冠API
- ✅ 从 `fetcher-isports` 读取数据
- ✅ 不会导致账号被封
- ✅ 更稳定、更快速、更可靠

