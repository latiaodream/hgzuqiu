# 更新到 iSportsAPI 部署指南

## 🎯 问题

前端 https://aibcbot.top/matches 无法显示赛事，因为：
1. ✅ `fetcher-isports` 服务已运行，数据保存在 `fetcher-isports/data/latest-matches.json`
2. ❌ 后端 SSE 流从 `fetcher/data/latest-matches.json` 读取数据（旧路径）
3. ❌ 前端无法获取到数据

## ✅ 解决方案

已修改后端代码，优先从 `fetcher-isports` 读取数据。

## 🚀 部署步骤

在服务器上执行以下命令：

```bash
# 1. 拉取最新代码
cd /www/wwwroot/aibcbot.top
git pull origin main

# 2. 重启后端服务
cd backend
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend

# 3. 查看后端日志
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 50
```

## ✅ 验证

### 1. 检查服务状态

```bash
/www/server/nodejs/v22.18.0/bin/pm2 status
```

应该看到两个服务都在运行：
- `bclogin-backend` - 后端服务
- `crown-fetcher-isports` - iSportsAPI 抓取服务

### 2. 检查数据文件

```bash
# 查看 iSportsAPI 数据
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | head -50

# 统计比赛数量
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | grep -o '"gid"' | wc -l
```

应该看到 100+ 场比赛。

### 3. 测试前端

访问 https://aibcbot.top/matches，应该能看到：
- ✅ 比赛列表正常显示
- ✅ 赔率数据正确
- ✅ 实时更新正常

## 📊 数据流程

```
iSportsAPI
   ↓
fetcher-isports 服务
   ↓
fetcher-isports/data/latest-matches.json
   ↓
后端 SSE 流读取
   ↓
前端实时显示
```

## 🔧 故障排查

### 问题 1：前端仍然无法显示赛事

**检查后端是否重启成功**：
```bash
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 50
```

**手动重启后端**：
```bash
cd /www/wwwroot/aibcbot.top/backend
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend
```

### 问题 2：数据文件不存在

**检查 fetcher-isports 服务是否运行**：
```bash
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --lines 50
```

**重启 fetcher-isports 服务**：
```bash
cd /www/wwwroot/aibcbot.top/fetcher-isports
/www/server/nodejs/v22.18.0/bin/pm2 restart crown-fetcher-isports
```

### 问题 3：数据不更新

**检查数据文件修改时间**：
```bash
ls -l /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json
```

应该每 2 秒更新一次。

**查看 fetcher-isports 日志**：
```bash
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports
```

应该看到类似输出：
```
🔄 赔率变化：让球 3，独赢 5，大小 3
✅ 已保存 112 场比赛数据
```

## 📝 技术细节

### 修改内容

**文件**：`backend/src/routes/crown-automation.ts`

**修改前**：
```typescript
const fetcherDataPath = path.join(__dirname, '../../..', 'fetcher', 'data', 'latest-matches.json');
```

**修改后**：
```typescript
// 优先尝试 fetcher-isports（iSportsAPI）
let fetcherDataPath = path.join(__dirname, '../../..', 'fetcher-isports', 'data', 'latest-matches.json');

// 如果不存在，回退到 fetcher（皇冠 API）
if (!fs.existsSync(fetcherDataPath)) {
  fetcherDataPath = path.join(__dirname, '../../..', 'fetcher', 'data', 'latest-matches.json');
}
```

### 优势

- ✅ **向后兼容**：如果 `fetcher-isports` 不存在，自动回退到 `fetcher`
- ✅ **无缝切换**：不需要修改前端代码
- ✅ **稳定可靠**：使用 iSportsAPI，不会被封账号

## 🎉 完成

部署完成后，前端应该能正常显示赛事了！

如果还有问题，请检查：
1. ✅ `crown-fetcher-isports` 服务是否运行
2. ✅ 数据文件是否存在且更新
3. ✅ 后端服务是否重启成功
4. ✅ 前端是否能访问后端 API

