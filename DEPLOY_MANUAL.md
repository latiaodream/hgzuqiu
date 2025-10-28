# 手动部署指南

## ⚠️ 当前状态

本地代码有 TypeScript 编译错误，需要先修复才能部署到服务器。

## 🔧 问题说明

当前有 42 个 TypeScript 编译错误，主要问题：

1. **缺少 Playwright 依赖** - `crown-automation.ts` 中使用了 Playwright，但未安装
2. **调用不存在的方法** - 一些方法被调用但未定义
3. **类型错误** - 一些参数缺少类型声明

## 📝 服务器手动更新步骤

由于本地代码有编译错误，建议**暂时不要**更新服务器。

如果你确实需要更新服务器上的其他功能（比如前端的初始化类型功能），可以按以下步骤操作：

### 步骤 1: 连接服务器
```bash
ssh root@47.238.112.207
# 密码: latiao@2025
```

### 步骤 2: 进入项目目录
```bash
cd /www/wwwroot/aibcbot.top
```

### 步骤 3: 查看当前状态
```bash
git status
git log --oneline -5
```

### 步骤 4: 拉取最新代码
```bash
git pull origin main
```

### 步骤 5: 执行数据库迁移
```bash
PGPASSWORD=AbDN22pKhcsNnJSk psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -f backend/migrations/20251027_add_init_type.sql
```

如果提示字段已存在，可以忽略。

### 步骤 6: 更新前端（前端没有编译错误）
```bash
cd /www/wwwroot/aibcbot.top/frontend
npm install
npm run build
```

### 步骤 7: 重启 Nginx
```bash
nginx -s reload
```

### 步骤 8: 查看前端是否更新成功
访问 https://aibcbot.top，检查：
- 添加账号时是否有"初始化类型"选择器
- 账号卡片是否显示初始化类型标签

### 步骤 9: 后端暂时不要更新
```bash
# ❌ 不要执行以下命令，因为会编译失败
# cd /www/wwwroot/aibcbot.top/backend
# npm run build
```

后端服务继续使用旧版本，不影响前端的初始化类型功能。

## 🎯 前端功能说明

前端的初始化类型功能已经完成，包括：

1. ✅ 添加账号时可以选择初始化类型
2. ✅ 智能判断初始化类型
3. ✅ 动态显示/隐藏相关字段
4. ✅ 账号卡片显示初始化类型标签

后端的初始化类型字段也已经添加到数据库，只是后端代码有其他编译错误需要修复。

## 🔍 后续工作

需要修复以下问题才能更新后端：

1. **安装 Playwright 依赖**（如果需要）
   ```bash
   cd backend
   npm install playwright
   ```

2. **修复缺少的方法**
   - `fetchTodayWagers`
   - `getAccountFinancialSummary`
   - `getExternalIP`
   - `getAccountCredit`
   - `fetchMatches`
   - `triggerFetchWarmup`
   - `navigateToLogin`
   - `getWarmSessionThreshold`
   - `checkSessionAlive`
   - `cleanupSession`

3. **修复类型错误**
   - 添加缺少的类型声明

## 💡 建议

1. **先更新前端** - 前端功能完整，可以先部署
2. **后端暂时不动** - 等修复编译错误后再更新
3. **测试前端功能** - 确保初始化类型功能正常工作

## 📞 如果遇到问题

1. 查看 PM2 日志：
   ```bash
   /www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 50
   ```

2. 查看 Nginx 日志：
   ```bash
   tail -f /var/log/nginx/error.log
   ```

3. 检查服务状态：
   ```bash
   /www/server/nodejs/v22.18.0/bin/pm2 status
   ```

---

**最后更新**: 2025-10-28

