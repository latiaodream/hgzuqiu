# 📁 项目结构说明

## 项目概述

**项目名称**: 智投系统（皇冠投注自动化系统）

**技术栈**:
- 后端: Node.js + TypeScript + Express + PostgreSQL
- 前端: React + TypeScript + Vite + Ant Design
- API: 纯 HTTP API（无浏览器自动化）

---

## 📂 目录结构

```
bclogin-system/
├── backend/                          # 后端服务
│   ├── src/                          # 源代码
│   │   ├── services/                 # 业务服务
│   │   │   ├── crown-api-client.ts   # 皇冠 API 客户端
│   │   │   ├── crown-automation.ts   # 自动化服务
│   │   │   └── account-selection.ts  # 账号选择服务
│   │   ├── routes/                   # API 路由
│   │   │   ├── auth.ts               # 认证路由
│   │   │   ├── crown-automation.ts   # 自动化路由
│   │   │   ├── accounts.ts           # 账号管理路由
│   │   │   ├── groups.ts             # 分组管理路由
│   │   │   ├── matches.ts            # 赛事路由
│   │   │   ├── bets.ts               # 下注路由
│   │   │   ├── agents.ts             # 代理管理路由
│   │   │   ├── staff.ts              # 员工管理路由
│   │   │   └── coins.ts              # 金币管理路由
│   │   ├── middleware/               # 中间件
│   │   │   ├── auth.ts               # 认证中间件
│   │   │   ├── permission.ts         # 权限中间件
│   │   │   ├── logger.ts             # 日志中间件
│   │   │   └── errorHandler.ts       # 错误处理中间件
│   │   ├── models/                   # 数据模型
│   │   │   └── database.ts           # 数据库连接
│   │   ├── types/                    # 类型定义
│   │   │   └── index.ts              # 类型定义
│   │   └── app.ts                    # 应用入口
│   ├── migrations/                   # 数据库迁移文件
│   ├── ensure-admin.js               # 管理员初始化脚本
│   ├── migrate.js                    # 数据库迁移脚本
│   ├── cleanup-all.sh                # 清理脚本
│   ├── package.json                  # 依赖配置
│   ├── tsconfig.json                 # TypeScript 配置
│   ├── .env                          # 环境变量配置
│   ├── CLEANUP_GUIDE.md              # 清理指南
│   └── MIGRATION_COMPLETE.md         # 迁移完成报告
│
├── frontend/                         # 前端应用
│   ├── src/                          # 源代码
│   │   ├── pages/                    # 页面组件
│   │   │   ├── LoginPage.tsx         # 登录页面
│   │   │   ├── DashboardPage.tsx     # 仪表盘页面
│   │   │   ├── AccountsPage.tsx      # 账号管理页面
│   │   │   ├── GroupsPage.tsx        # 分组管理页面
│   │   │   ├── MatchesPage.tsx       # 赛事页面
│   │   │   ├── BetsPage.tsx          # 下注记录页面
│   │   │   ├── AgentsPage.tsx        # 代理管理页面
│   │   │   ├── StaffPage.tsx         # 员工管理页面
│   │   │   └── CoinsPage.tsx         # 金币管理页面
│   │   ├── services/                 # API 服务
│   │   │   └── api.ts                # API 客户端
│   │   ├── types/                    # 类型定义
│   │   │   └── index.ts              # 类型定义
│   │   ├── utils/                    # 工具函数
│   │   │   └── credentials.ts        # 凭证管理
│   │   ├── App.tsx                   # 应用入口
│   │   └── main.tsx                  # 主入口
│   ├── package.json                  # 依赖配置
│   ├── vite.config.ts                # Vite 配置
│   ├── tsconfig.json                 # TypeScript 配置
│   └── index.html                    # HTML 模板
│
├── scripts/                          # 测试脚本
│   ├── test-credit-limit.js          # 信用额度测试
│   ├── test-new-agent.js             # 新代理测试
│   ├── test-roles.js                 # 角色测试
│   └── test-stats-api.js             # 统计 API 测试
│
├── docs/                             # 文档目录（如果有）
│
├── README.md                         # 项目说明
├── PLAYWRIGHT_TO_API_MIGRATION.md    # 迁移报告
├── CLEANUP_REPORT.md                 # 清理报告
└── PROJECT_STRUCTURE.md              # 项目结构说明（本文件）
```

---

## 🔑 核心文件说明

### 后端核心文件

#### 1. `backend/src/services/crown-api-client.ts`

**功能**: 皇冠 API 客户端

**关键方法**:
- `login(username, password)` - 登录接口
- `getMatches(params)` - 获取赛事列表
- `getOdds(params)` - 获取最新赔率
- `placeBet(params)` - 下注接口

**特性**:
- 自动管理 Cookie 和会话
- 自动生成 `blackbox` 和 `userAgent` 参数
- 支持多账号并发登录

#### 2. `backend/src/services/crown-automation.ts`

**功能**: 自动化服务

**关键方法**:
- `initSystemAccount()` - 初始化系统账号
- `loginAccount(account)` - 登录账号
- `fetchMatchesSystem(params)` - 获取赛事（使用系统账号）
- `parseMatchesFromXml(xml)` - 解析 XML 赛事数据
- `parseMarkets(block)` - 解析盘口数据

**特性**:
- 系统账号自动登录
- 多账号会话管理
- XML 数据解析

#### 3. `backend/src/routes/crown-automation.ts`

**功能**: 自动化 API 路由

**主要接口**:
- `POST /api/crown-automation/login` - 登录账号
- `POST /api/crown-automation/logout` - 登出账号
- `GET /api/crown-automation/status` - 获取状态
- `GET /api/crown-automation/matches-system` - 获取赛事（系统账号）
- `GET /api/crown-automation/matches/:accountId` - 获取赛事（指定账号）
- `GET /api/crown-automation/matches-stream` - SSE 实时推送赛事
- `POST /api/crown-automation/bet` - 下注

#### 4. `backend/src/app.ts`

**功能**: 应用入口

**特性**:
- Express 应用初始化
- 中间件配置
- 路由注册
- 系统账号自动初始化

### 前端核心文件

#### 1. `frontend/src/pages/MatchesPage.tsx`

**功能**: 赛事页面

**特性**:
- 显示所有滚球赛事
- 显示多个盘口（让球、大小球、半场等）
- SSE 实时更新
- 点击盘口下注

#### 2. `frontend/src/services/api.ts`

**功能**: API 客户端

**特性**:
- Axios 封装
- 自动添加 Token
- 错误处理
- 请求/响应拦截

---

## 🗄️ 数据库结构

### 主要表

1. **users** - 用户表
   - 管理员、代理、员工

2. **crown_accounts** - 皇冠账号表
   - 账号信息
   - 登录凭证
   - 在线状态

3. **groups** - 分组表
   - 账号分组管理

4. **matches** - 赛事表
   - 赛事信息
   - 盘口数据

5. **bets** - 下注记录表
   - 下注信息
   - 下注结果

6. **coin_transactions** - 金币交易表
   - 金币充值
   - 金币消费

---

## 🔧 配置文件

### 后端配置

#### `backend/.env`

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=lt
DB_PASSWORD=lt123456
DB_NAME=bclogin_system

# JWT 配置
JWT_SECRET=your-secret-key-here

# 服务器配置
PORT=3001
NODE_ENV=development
```

#### `backend/package.json`

**核心依赖**:
- `express` - Web 框架
- `pg` - PostgreSQL 客户端
- `axios` - HTTP 客户端
- `jsonwebtoken` - JWT 认证
- `bcrypt` - 密码加密
- `cors` - CORS 中间件
- `dotenv` - 环境变量

### 前端配置

#### `frontend/vite.config.ts`

**配置**:
- 开发服务器端口: 10087
- 代理配置: `/api` → `http://localhost:3001`

---

## 🚀 启动指南

### 1. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd frontend
npm install
```

### 2. 配置数据库

```bash
# 创建数据库
createdb bclogin_system

# 运行迁移
cd backend
node migrate.js

# 初始化管理员
node ensure-admin.js
```

### 3. 启动服务

```bash
# 后端
cd backend
npm run dev

# 前端
cd frontend
npm run dev
```

### 4. 访问系统

- 前端: http://127.0.0.1:10087
- 后端: http://localhost:3001
- 管理员账号: admin / 123456

---

## 📝 开发指南

### 添加新功能

1. **后端**:
   - 在 `backend/src/routes/` 添加路由
   - 在 `backend/src/services/` 添加服务
   - 在 `backend/src/types/` 添加类型定义

2. **前端**:
   - 在 `frontend/src/pages/` 添加页面
   - 在 `frontend/src/services/api.ts` 添加 API 调用
   - 在 `frontend/src/types/` 添加类型定义

### 数据库迁移

```bash
# 创建迁移文件
cd backend/migrations
touch YYYYMMDD_description.sql

# 运行迁移
cd backend
node migrate.js
```

---

## 🎯 项目特点

1. **纯 API 方案**: 不使用浏览器自动化，性能更好
2. **多账号管理**: 支持多个皇冠账号并发登录
3. **实时更新**: SSE 推送赛事数据
4. **权限管理**: 管理员、代理、员工三级权限
5. **金币系统**: 虚拟金币充值和消费

---

**文档版本**: 1.0

**更新时间**: 2025-10-22

**维护人员**: Augment Agent

