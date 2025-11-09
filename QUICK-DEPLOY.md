# 快速部署指南 - 迁移到 iSports

## 🚀 一键部署

```bash
# 1. 进入项目目录
cd /www/wwwroot/aibcbot.top

# 2. 拉取最新代码
git pull

# 3. 确保 fetcher-isports 服务运行
pm2 status crown-fetcher-isports || (cd fetcher-isports && pm2 start ecosystem.config.js)

# 4. 等待服务生成数据（2分钟）
echo "⏳ 等待 fetcher-isports 生成数据..."
sleep 120

# 5. 测试新脚本
cd backend
npm run test:fetch-gids

# 6. 运行一次抓取
npm run crown:fetch-gids

# 7. 完成！
echo "✅ 部署完成！"
```

## 📋 详细步骤

### 步骤 1：检查当前状态

```bash
cd /www/wwwroot/aibcbot.top

# 检查 Git 状态
git status

# 检查服务状态
pm2 status
```

### 步骤 2：拉取最新代码

```bash
# 拉取代码
git pull

# 如果有冲突，先备份本地修改
git stash
git pull
git stash pop
```

### 步骤 3：确保 fetcher-isports 运行

```bash
# 检查服务
pm2 status crown-fetcher-isports

# 如果未运行，启动服务
cd fetcher-isports
pm2 start ecosystem.config.js

# 查看日志确认正常
pm2 logs crown-fetcher-isports --lines 20
```

**预期日志**：
```
✅ 获取到 245 场比赛
✅ 获取到皇冠赔率：让球 180，独赢 200，大小 190
📊 数据统计: iSports 180 场, 皇冠独有 65 场, 总计 245 场
💾 已保存数据到 ./data/latest-matches.json
```

### 步骤 4：等待数据生成

```bash
# 等待 2 分钟让服务生成数据
echo "⏳ 等待 fetcher-isports 生成数据..."
sleep 120

# 检查数据文件
ls -lh fetcher-isports/data/latest-matches.json

# 查看数据内容
cat fetcher-isports/data/latest-matches.json | jq '.matchCount'
```

### 步骤 5：测试新脚本

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
   - 数据年龄: 15 秒
   - 赛事总数: 245

✅ 测试通过！
```

### 步骤 6：运行抓取脚本

```bash
# 运行脚本
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

### 步骤 7：验证输出文件

```bash
# 检查输出文件
ls -lh crown-gids.json

# 查看文件内容
cat crown-gids.json | jq '.matchCount'
cat crown-gids.json | jq '.source'
```

**预期输出**：
```json
{
  "generatedAt": "2025-11-09T06:30:25.123Z",
  "source": "fetcher-isports",
  "matchCount": 245,
  "matches": [...]
}
```

### 步骤 8：测试定时任务

```bash
# 手动执行定时任务
npm run cron:update
```

**预期日志**：
```
============================================================
🔄 开始更新映射文件
============================================================
📥 从 fetcher-isports 提取比赛列表...
✅ 比赛列表提取成功
🔄 重新生成映射文件...
✅ 映射文件生成成功
🔄 重启 fetcher-isports 服务...
✅ 服务重启成功
============================================================
✅ 映射文件更新完成
============================================================
```

## ✅ 验证清单

- [ ] fetcher-isports 服务正常运行
- [ ] latest-matches.json 文件存在且数据新鲜（< 5分钟）
- [ ] test:fetch-gids 测试通过
- [ ] crown:fetch-gids 运行成功
- [ ] crown-gids.json 文件生成
- [ ] 定时任务手动执行成功

## 🔍 常见问题

### Q1: fetcher-isports 服务未运行

```bash
cd /www/wwwroot/aibcbot.top/fetcher-isports
pm2 start ecosystem.config.js
pm2 save
```

### Q2: 数据文件不存在

```bash
# 检查服务日志
pm2 logs crown-fetcher-isports --lines 50

# 重启服务
pm2 restart crown-fetcher-isports

# 等待 2 分钟
sleep 120
```

### Q3: 测试失败

```bash
# 查看详细错误
cd backend
npm run test:fetch-gids 2>&1 | tee test-output.log

# 检查 fetcher-isports 日志
pm2 logs crown-fetcher-isports --lines 100
```

### Q4: 数据过期

```bash
# 重启 fetcher-isports
pm2 restart crown-fetcher-isports

# 等待服务恢复
sleep 120

# 重新测试
cd backend
npm run test:fetch-gids
```

## 📞 获取帮助

如果遇到问题：

1. 查看日志：
   ```bash
   pm2 logs crown-fetcher-isports --lines 100
   ```

2. 查看文档：
   - [迁移文档](backend/docs/MIGRATION-TO-ISPORTS.md)
   - [改动总结](MIGRATION-SUMMARY.md)

3. 运行诊断：
   ```bash
   cd backend
   npm run diagnose:isports
   ```

## 🎉 完成

部署完成后，系统将：

- ✅ 不再使用皇冠API直接抓取
- ✅ 从 fetcher-isports 读取数据
- ✅ 避免账号被封
- ✅ 定时任务自动运行

**重要提示**：
- 确保 fetcher-isports 服务持续运行
- 定期检查服务日志
- 数据会每 60 秒自动更新

