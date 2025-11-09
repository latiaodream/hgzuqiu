# 迁移到 iSports 数据源

## 📋 概述

为了避免皇冠账号被封，系统已完全迁移到使用 iSportsAPI 作为数据源。

## 🔄 改动说明

### 1. 赛事抓取方式变更

**之前**：
- 使用皇冠API直接抓取赛事（`CrownApiClient.getGameList()`）
- 会导致抓取账号被封

**现在**：
- 使用 `fetcher-isports` 服务从 iSportsAPI 获取数据
- 不会导致账号被封
- 数据更稳定可靠

### 2. 修改的文件

#### `backend/scripts/fetch-crown-gids.ts`

**改动前**：
```typescript
// 使用皇冠API登录并抓取
const client = new CrownApiClient({ baseUrl });
const loginResult = await client.login(username, password);
const xml = await client.getGameList({ ... });
```

**改动后**：
```typescript
// 从 fetcher-isports 的数据文件读取
const fetcherData = JSON.parse(fs.readFileSync('fetcher-isports/data/latest-matches.json'));
const matches = fetcherData.matches;
```

## 🚀 使用方法

### 1. 确保 fetcher-isports 服务运行

```bash
# 检查服务状态
pm2 status crown-fetcher-isports

# 如果未运行，启动服务
cd /www/wwwroot/aibcbot.top/fetcher-isports
pm2 start ecosystem.config.js

# 查看日志
pm2 logs crown-fetcher-isports
```

### 2. 运行赛事抓取脚本

```bash
cd /www/wwwroot/aibcbot.top/backend

# 运行脚本（不再需要皇冠账号密码）
npm run crown:fetch-gids
```

**输出示例**：
```
🔄 从 fetcher-isports 读取赛事数据...
💡 此脚本不再使用皇冠API，避免账号被封

✅ 从 /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json 读取数据成功

📊 数据统计:
   - 数据文件: /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json
   - 数据时间: 2025-11-09 14:30:25
   - 数据年龄: 15 秒
   - 赛事总数: 245

📊 赛事分类:
   - 滚球 (live): 45 场
   - 今日 (today): 120 场
   - 早盘 (early): 80 场
   - 总计: 245 场

✅ 已保存到: /www/wwwroot/aibcbot.top/backend/crown-gids.json

💡 提示: 此脚本现在从 fetcher-isports 读取数据，不会导致皇冠账号被封
```

### 3. 定时任务自动运行

定时任务 `cron-update-mapping.sh` 会自动调用此脚本，无需手动干预。

```bash
# 查看定时任务
crontab -l | grep cron-update-mapping

# 手动执行定时任务
npm run cron:update
```

## ✅ 优势

1. **不会被封号**：不再直接调用皇冠API
2. **更稳定**：使用专业的 iSportsAPI 服务
3. **更快速**：直接读取本地文件，无需网络请求
4. **更可靠**：fetcher-isports 服务持续运行，数据实时更新

## 🔍 故障排查

### 问题 1：找不到数据文件

**错误信息**：
```
❌ 无法找到 fetcher-isports 的数据文件
   请确保 fetcher-isports 服务正在运行
```

**解决方法**：
```bash
# 1. 检查服务状态
pm2 status crown-fetcher-isports

# 2. 如果未运行，启动服务
cd /www/wwwroot/aibcbot.top/fetcher-isports
pm2 start ecosystem.config.js

# 3. 等待1-2分钟让服务生成数据文件
sleep 120

# 4. 检查数据文件是否存在
ls -lh /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json

# 5. 重新运行脚本
cd /www/wwwroot/aibcbot.top/backend
npm run crown:fetch-gids
```

### 问题 2：数据过期

**警告信息**：
```
⚠️ 数据已过期 (15 分钟前)
   建议检查 fetcher-isports 服务是否正常运行
```

**解决方法**：
```bash
# 1. 查看服务日志
pm2 logs crown-fetcher-isports --lines 50

# 2. 检查是否有错误
# 常见错误：API调用次数超限、网络问题等

# 3. 重启服务
pm2 restart crown-fetcher-isports

# 4. 等待服务恢复
sleep 120

# 5. 重新运行脚本
cd /www/wwwroot/aibcbot.top/backend
npm run crown:fetch-gids
```

### 问题 3：赛事数量为0

**可能原因**：
1. fetcher-isports 服务刚启动，还未获取到数据
2. iSportsAPI 返回空数据
3. 数据文件格式错误

**解决方法**：
```bash
# 1. 查看数据文件内容
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | jq '.matchCount'

# 2. 如果 matchCount 为 0，检查 fetcher-isports 日志
pm2 logs crown-fetcher-isports --lines 100

# 3. 检查 iSportsAPI 是否正常
cd /www/wwwroot/aibcbot.top/backend
npm run diagnose:isports

# 4. 如果 API 正常但无数据，可能是时间段问题
# 等待下一个更新周期（60秒）
```

## 📝 环境变量

**不再需要的环境变量**：
- `CROWN_USERNAME` - 皇冠账号（脚本不再使用）
- `CROWN_PASSWORD` - 皇冠密码（脚本不再使用）
- `CROWN_BASE_URL` - 皇冠站点（脚本不再使用）

**仍然需要的环境变量**：
- `ISPORTS_API_KEY` - iSportsAPI 密钥（fetcher-isports 使用）

## 🔄 回滚方案

如果需要回滚到使用皇冠API的版本：

```bash
cd /www/wwwroot/aibcbot.top/backend

# 1. 查看 Git 历史
git log --oneline scripts/fetch-crown-gids.ts

# 2. 回滚到之前的版本
git checkout <commit-hash> scripts/fetch-crown-gids.ts

# 3. 重新运行（需要设置皇冠账号密码）
CROWN_USERNAME=xxx CROWN_PASSWORD=xxx npm run crown:fetch-gids
```

**注意**：不建议回滚，因为会导致账号被封。

## 📚 相关文档

- [iSportsAPI 文档](../fetcher-isports/README.md)
- [定时任务文档](./cron-mapping-updater.md)
- [数据源整合文档](../docs/crown-isports-data-source-integration.md)

## 🎯 总结

通过这次迁移，系统不再依赖皇冠API直接抓取赛事，避免了账号被封的问题。所有赛事数据现在都通过 iSportsAPI 获取，更加稳定可靠。

