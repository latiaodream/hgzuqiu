# 服务器配置信息

## 🖥️ 服务器基本信息

### SSH 连接信息
- **服务器IP**: 47.238.112.207
- **用户名**: root
- **密码**: latiao@2025
- **SSH端口**: 22

### 连接命令
```bash
ssh root@47.238.112.207
# 密码: latiao@2025
```

---

## 📁 项目目录结构

### 项目根目录
```
/www/wwwroot/aibcbot.top/
```

### 完整目录结构
```
/www/wwwroot/aibcbot.top/
├── backend/          # 后端代码
├── frontend/         # 前端代码
├── database/         # 数据库脚本
├── docs/            # 文档
├── logs/            # 日志文件
├── scripts/         # 脚本文件
├── captures/        # 截图文件
├── 足球图片/        # 足球图片资源
└── .gitignore
```

---

## 🗄️ 数据库配置

### PostgreSQL 连接信息
- **主机**: 127.0.0.1
- **端口**: 5432
- **数据库名**: hgzuqiu
- **用户名**: hgzuqiu
- **密码**: AbDN22pKhcsNnJSk

### 连接命令
```bash
PGPASSWORD=AbDN22pKhcsNnJSk psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu
```

### 执行迁移脚本
```bash
cd /www/wwwroot/aibcbot.top
PGPASSWORD=AbDN22pKhcsNnJSk psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -f backend/migrations/文件名.sql
```

---

## 🚀 Node.js 环境

### Node.js 版本
- **版本**: v22.18.0
- **安装路径**: /www/server/nodejs/v22.18.0

### PM2 路径
```bash
/www/server/nodejs/v22.18.0/bin/pm2
```

### PM2 常用命令
```bash
# 查看所有进程
/www/server/nodejs/v22.18.0/bin/pm2 status

# 重启后端服务
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend

# 查看日志
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend

# 查看最近20行日志
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 20 --nostream

# 实时查看日志
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 100 --follow

# 停止服务
/www/server/nodejs/v22.18.0/bin/pm2 stop bclogin-backend

# 启动服务
/www/server/nodejs/v22.18.0/bin/pm2 start bclogin-backend
```

---

## 🌐 Web 服务器

### Nginx
- **配置文件**: /etc/nginx/nginx.conf 或 /www/server/panel/vhost/nginx/
- **重启命令**: `nginx -s reload`
- **测试配置**: `nginx -t`

### 域名
- **主域名**: https://aibcbot.top
- **HTTP端口**: 80
- **HTTPS端口**: 443

---

## 📦 部署流程

### 完整部署步骤

#### 1. 连接服务器
```bash
ssh root@47.238.112.207
# 输入密码: latiao@2025
```

#### 2. 进入项目目录
```bash
cd /www/wwwroot/aibcbot.top
```

#### 3. 拉取最新代码
```bash
git pull origin main
```

#### 4. 执行数据库迁移（如果有）
```bash
PGPASSWORD=AbDN22pKhcsNnJSk psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -f backend/migrations/迁移文件.sql
```

#### 5. 更新后端
```bash
cd /www/wwwroot/aibcbot.top/backend
npm install
npm run build
```

#### 6. 重启后端服务
```bash
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend
```

#### 7. 更新前端
```bash
cd /www/wwwroot/aibcbot.top/frontend
npm install
npm run build
```

#### 8. 重启 Nginx
```bash
nginx -s reload
```

#### 9. 查看日志确认
```bash
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 20
```

---

## 🔧 快速命令

### 一键更新脚本
```bash
cd /www/wwwroot/aibcbot.top && \
git pull origin main && \
cd backend && npm install && npm run build && \
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend && \
cd ../frontend && npm install && npm run build && \
nginx -s reload && \
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 20 --nostream
```

### 仅更新后端
```bash
cd /www/wwwroot/aibcbot.top && \
git pull origin main && \
cd backend && npm install && npm run build && \
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend
```

### 仅更新前端
```bash
cd /www/wwwroot/aibcbot.top && \
git pull origin main && \
cd frontend && npm install && npm run build && \
nginx -s reload
```

---

## 🐛 常见问题

### 1. TypeScript 编译错误
**问题**: `npm run build` 时出现 TS 错误

**解决方案**:
- 先在本地修复所有 TypeScript 错误
- 确保本地 `npm run build` 成功
- 然后再推送到服务器

### 2. 数据库迁移失败
**问题**: 提示字段已存在

**解决方案**:
- 这是正常的，说明迁移已经执行过
- 可以忽略，继续下一步

### 3. PM2 命令找不到
**问题**: `pm2: command not found`

**解决方案**:
- 使用完整路径: `/www/server/nodejs/v22.18.0/bin/pm2`

### 4. 前端构建失败
**问题**: `npm run build` 失败

**解决方案**:
- 检查 Node.js 版本: `node -v`
- 清除缓存: `rm -rf node_modules package-lock.json && npm install`

### 5. Nginx 配置错误
**问题**: `nginx -s reload` 失败

**解决方案**:
- 测试配置: `nginx -t`
- 查看错误日志: `tail -f /var/log/nginx/error.log`

---

## 📊 监控和日志

### 查看服务状态
```bash
/www/server/nodejs/v22.18.0/bin/pm2 status
```

### 查看实时日志
```bash
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --follow
```

### 查看错误日志
```bash
/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --err --lines 50
```

### 查看 Nginx 日志
```bash
# 访问日志
tail -f /var/log/nginx/access.log

# 错误日志
tail -f /var/log/nginx/error.log
```

---

## 🔐 测试账号

### 管理员账号
- **用户名**: zhuren
- **密码**: 123456
- **角色**: admin

---

## 📝 重要提醒

1. **修改代码前先备份**
   ```bash
   cd /www/wwwroot/aibcbot.top
   tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz backend frontend
   ```

2. **数据库备份**
   ```bash
   PGPASSWORD=AbDN22pKhcsNnJSk pg_dump -h 127.0.0.1 -U hgzuqiu hgzuqiu > backup-$(date +%Y%m%d-%H%M%S).sql
   ```

3. **查看磁盘空间**
   ```bash
   df -h
   ```

4. **查看内存使用**
   ```bash
   free -h
   ```

5. **查看进程**
   ```bash
   ps aux | grep node
   ```

---

## 🔄 Git 配置

### 查看远程仓库
```bash
cd /www/wwwroot/aibcbot.top
git remote -v
```

### 查看当前分支
```bash
git branch
```

### 查看最近提交
```bash
git log --oneline -10
```

### 强制拉取（慎用）
```bash
git fetch origin
git reset --hard origin/main
```

---

## 📞 联系方式

- **项目仓库**: https://github.com/latiaodream/hgzuqiu
- **在线地址**: https://aibcbot.top

---

**最后更新**: 2025-10-28
**维护人员**: latiaodream

