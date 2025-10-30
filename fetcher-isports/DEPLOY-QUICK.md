# 快速部署指南

## 🚀 一键部署（推荐）

在服务器上执行以下命令：

```bash
# 1. 拉取最新代码
cd /www/wwwroot/aibcbot.top
git pull origin main

# 2. 进入目录
cd fetcher-isports

# 3. 运行一键部署脚本
./deploy.sh
```

部署脚本会自动完成：
- ✅ 安装依赖
- ✅ 编译 TypeScript
- ✅ 停止旧服务
- ✅ 启动新服务
- ✅ 保存 PM2 配置

## 📝 查看日志

```bash
# 实时查看日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports

# 查看最近 50 行日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --lines 50
```

## ✅ 验证服务

### 1. 检查服务状态

```bash
/www/server/nodejs/v22.18.0/bin/pm2 status
```

应该看到 `crown-fetcher-isports` 状态为 `online`。

### 2. 检查数据文件

```bash
# 查看数据文件
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | head -50

# 统计比赛数量
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | grep -o '"gid"' | wc -l
```

应该看到 100+ 场比赛数据。

### 3. 查看日志输出

日志应该显示类似内容：

```
✅ 获取到 264 场比赛
✅ 获取到皇冠赔率：让球 731，独赢 731，大小 731
✅ 已保存 112 场比赛数据
🔄 赔率变化：让球 7，独赢 3，大小 4
```

## 🔧 修改后端读取路径

编辑 `backend/src/routes/matches.ts`：

```typescript
// 找到这一行
const dataPath = path.join(__dirname, '../../../fetcher/data/latest-matches.json');

// 改为
const dataPath = path.join(__dirname, '../../../fetcher-isports/data/latest-matches.json');
```

然后重启后端：

```bash
cd /www/wwwroot/aibcbot.top/backend
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend
```

## 🎯 验证前端

访问前端页面，检查：
- ✅ 比赛列表是否正常显示
- ✅ 赔率数据是否正确
- ✅ 实时更新是否正常

## 🆘 故障排查

### 问题 1：服务无法启动

```bash
# 查看错误日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --err

# 手动测试
cd /www/wwwroot/aibcbot.top/fetcher-isports
node dist/index.js
```

### 问题 2：数据未更新

```bash
# 检查数据文件修改时间
ls -l /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json

# 手动测试 API
curl "http://api.isportsapi.com/sport/football/schedule/basic?api_key=GvpziueL9ouzIJNj&date=$(date +%Y-%m-%d)"
```

### 问题 3：编译失败

```bash
# 重新安装依赖
cd /www/wwwroot/aibcbot.top/fetcher-isports
rm -rf node_modules package-lock.json
npm install

# 重新编译
npm run build
```

## 📞 常用命令

```bash
# 查看服务状态
/www/server/nodejs/v22.18.0/bin/pm2 status

# 查看日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports

# 重启服务
/www/server/nodejs/v22.18.0/bin/pm2 restart crown-fetcher-isports

# 停止服务
/www/server/nodejs/v22.18.0/bin/pm2 stop crown-fetcher-isports

# 删除服务
/www/server/nodejs/v22.18.0/bin/pm2 delete crown-fetcher-isports
```

## ✅ 部署完成

如果一切正常，你应该看到：
- ✅ 服务状态为 `online`
- ✅ 日志显示正常获取数据
- ✅ 数据文件每 2 秒更新
- ✅ 前端显示正常

恭喜！iSportsAPI 集成部署成功！🎉

