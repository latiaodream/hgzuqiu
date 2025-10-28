# 部署更新指南 - 限额自动获取功能

## 📋 更新概述

本次更新添加了**账号限额自动获取功能**，包括：
- ✅ 新增账号时自动获取限额
- ✅ 编辑账号时手动获取限额
- ✅ 自动保存到数据库
- ✅ 友好的用户提示

## 🚀 部署步骤

### 方法 1: 完整部署流程（推荐）

#### 1. 备份当前系统

```bash
# 进入项目目录
cd /Users/lt/Documents/kaifa/bclogin-system

# 备份数据库（如果需要）
pg_dump -U postgres bclogin > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份当前代码（可选）
cp -r . ../bclogin-system-backup-$(date +%Y%m%d_%H%M%S)
```

#### 2. 拉取最新代码

```bash
# 确保在项目根目录
cd /Users/lt/Documents/kaifa/bclogin-system

# 拉取最新代码
git pull origin main
```

**预期输出**：
```
remote: Enumerating objects: 39, done.
remote: Counting objects: 100% (39/39), done.
remote: Compressing objects: 100% (23/23), done.
remote: Total 24 (delta 14), reused 0 (delta 0)
Unpacking objects: 100% (24/24), done.
From https://github.com/latiaodream/hgzuqiu
   b199e02..7d49083  main       -> origin/main
Updating b199e02..7d49083
Fast-forward
 backend/src/routes/crown-automation.ts           | 65 ++++++++++
 backend/src/services/crown-api-client.ts         | 42 +++++++
 backend/src/services/crown-automation.ts         | 162 +++++++++++++++++++++++
 frontend/src/components/Accounts/AccountFormModal.tsx | 89 +++++++++++++
 frontend/src/services/api.ts                     | 6 +
 ...
 12 files changed, 2138 insertions(+)
```

#### 3. 安装依赖（如有新增）

```bash
# 后端依赖
cd backend
npm install

# 前端依赖
cd ../frontend
npm install
```

#### 4. 编译后端代码

```bash
cd backend
npm run build
```

**预期输出**：
```
> backend@1.0.0 build
> tsc

✓ Compiled successfully
```

#### 5. 重启服务

##### 如果使用 PM2：

```bash
# 查看当前运行的服务
pm2 list

# 重启后端
pm2 restart backend

# 重启前端（如果使用 PM2 管理）
pm2 restart frontend

# 或者重启所有服务
pm2 restart all
```

##### 如果使用开发模式：

```bash
# 终端 1: 重启后端
cd backend
npm run dev

# 终端 2: 重启前端
cd frontend
npm run dev
```

#### 6. 验证部署

```bash
# 测试后端功能
cd backend
node backend/test-fetch-limits.js
```

**预期输出**：
```
🧪 开始测试限额获取功能...

📝 测试账号: heizi2025
============================================================

1️⃣ 测试登录...
✅ 登录成功

2️⃣ 获取限额页面...
✅ 限额页面获取成功

3️⃣ 解析限额数据...
✅ 找到足球限额表格
✅ 找到篮球限额表格

4️⃣ 解析结果:
============================================================

⚽ 足球限额:
   赛前限额: 200,000
   滚球限额: 200,000

🏀 篮球限额:
   赛前限额: 200,000
   滚球限额: 200,000

============================================================
✅ 测试完成！限额获取功能正常工作
```

#### 7. 前端测试

1. 打开浏览器访问系统
2. 登录账号
3. 进入"账号管理"页面
4. 点击"添加账号"
5. 填写账号信息并保存
6. 观察是否显示"正在自动获取限额信息..."
7. 验证是否显示"限额信息已自动获取并保存"

### 方法 2: 快速更新（适用于熟悉的用户）

```bash
# 一键更新脚本
cd /Users/lt/Documents/kaifa/bclogin-system
git pull origin main
cd backend && npm install && npm run build
pm2 restart all
```

## 🔍 验证清单

部署完成后，请验证以下功能：

- [ ] 后端服务正常启动
- [ ] 前端页面正常访问
- [ ] 可以正常登录系统
- [ ] 可以查看账号列表
- [ ] **新功能**: 添加账号时自动获取限额
- [ ] **新功能**: 编辑账号时可以手动获取限额
- [ ] 限额数据正确保存到数据库

## 📊 数据库检查

### 验证限额字段

```sql
-- 查看账号表结构
\d crown_accounts

-- 查看限额字段
SELECT 
    id,
    username,
    football_prematch_limit,
    football_live_limit,
    basketball_prematch_limit,
    basketball_live_limit
FROM crown_accounts
LIMIT 5;
```

**注意**: 数据库结构无需修改，限额字段已存在。

## 🐛 故障排除

### 问题 1: git pull 失败

**错误信息**：
```
error: Your local changes to the following files would be overwritten by merge
```

**解决方案**：
```bash
# 方案 A: 保存本地修改
git stash
git pull origin main
git stash pop

# 方案 B: 放弃本地修改（谨慎使用）
git reset --hard HEAD
git pull origin main
```

### 问题 2: npm install 失败

**错误信息**：
```
npm ERR! code ECONNREFUSED
```

**解决方案**：
```bash
# 清除 npm 缓存
npm cache clean --force

# 重新安装
npm install
```

### 问题 3: 编译失败

**错误信息**：
```
error TS2307: Cannot find module
```

**解决方案**：
```bash
# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装依赖
npm install

# 重新编译
npm run build
```

### 问题 4: PM2 重启失败

**错误信息**：
```
[PM2] Process not found
```

**解决方案**：
```bash
# 查看所有进程
pm2 list

# 如果没有进程，重新启动
cd backend
pm2 start npm --name "backend" -- run dev

cd ../frontend
pm2 start npm --name "frontend" -- run dev
```

### 问题 5: 限额获取失败

**可能原因**：
1. 账号密码错误
2. 皇冠网站无法访问
3. 网络连接问题

**解决方案**：
```bash
# 1. 测试网络连接
curl https://hga038.com

# 2. 运行测试脚本
cd backend
node backend/test-fetch-limits.js

# 3. 查看后端日志
tail -f logs/app.log
```

## 📝 回滚步骤

如果更新后出现问题，可以回滚到之前的版本：

```bash
# 1. 查看提交历史
git log --oneline

# 2. 回滚到上一个版本
git reset --hard b199e02

# 3. 重新编译
cd backend
npm run build

# 4. 重启服务
pm2 restart all
```

## 🔧 配置检查

### 后端配置

检查 `backend/.env` 文件：
```bash
cat backend/.env
```

确保以下配置正确：
- `DATABASE_URL` - 数据库连接
- `JWT_SECRET` - JWT 密钥
- `PORT` - 后端端口（默认 3001）

### 前端配置

检查 `frontend/.env` 文件：
```bash
cat frontend/.env
```

确保以下配置正确：
- `VITE_API_URL` - 后端 API 地址

## 📞 技术支持

### 查看日志

```bash
# 后端日志
tail -f backend/logs/app.log

# PM2 日志
pm2 logs backend
pm2 logs frontend

# 系统日志
journalctl -u bclogin-backend -f
```

### 常用命令

```bash
# 查看服务状态
pm2 status

# 查看服务详情
pm2 show backend

# 重启服务
pm2 restart backend

# 停止服务
pm2 stop backend

# 查看实时日志
pm2 logs backend --lines 100
```

## 📚 相关文档

- [快速参考](QUICK_REFERENCE_LIMITS.md) - 功能使用说明
- [测试指南](TEST_FETCH_LIMITS.md) - 详细测试步骤
- [功能文档](docs/fetch-limits-feature.md) - 完整功能说明
- [变更日志](CHANGELOG_LIMITS_FEATURE.md) - 详细变更记录

## ✅ 部署完成确认

部署完成后，请确认：

- [x] 代码已更新到最新版本
- [x] 依赖已正确安装
- [x] 后端代码已编译
- [x] 服务已重启
- [x] 测试脚本运行成功
- [x] 前端功能正常
- [x] 限额自动获取功能正常工作

## 🎉 部署成功

恭喜！限额自动获取功能已成功部署！

现在用户可以：
- ✅ 添加账号时自动获取限额
- ✅ 编辑账号时手动更新限额
- ✅ 享受更便捷的账号管理体验

---

**部署日期**: 2025-10-28  
**版本**: v1.0.0  
**Git Commit**: 7d49083

