# 智投系统 - 皇冠足球下注管理平台

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-v22.18.0-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.9.2-blue.svg)
![React](https://img.shields.io/badge/react-18.3.1-61dafb.svg)
![PostgreSQL](https://img.shields.io/badge/postgresql-14+-336791.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**专业的皇冠足球博彩管理平台**

[在线演示](https://aibcbot.top) | [完整文档](./PROJECT_DOCUMENTATION.md) | [问题反馈](https://github.com/latiaodream/hgzuqiu/issues)

</div>

---

## 📖 项目简介

智投系统是一个功能完善的皇冠足球博彩管理平台，提供账号管理、赛事抓取、自动下注、结算同步、金币流水等完整功能。系统支持多级用户权限管理（管理员、代理、员工），实现了从赛事数据获取到下注结算的全流程自动化。

### ✨ 核心功能

- 🎯 **账号管理** - 管理皇冠平台账号，支持代理分配、设备配置、限额设置
- ⚽ **赛事管理** - 自动抓取皇冠平台赛事数据和实时赔率
- 🤖 **智能下注** - 支持批量下注、间隔下注、赔率控制
- 💰 **结算同步** - 自动同步下注结果和盈亏数据
- 🪙 **金币系统** - 虚拟金币管理，用于权限控制和成本核算
- 📊 **数据看板** - 实时统计下注数据、盈亏分析、回报率计算
- 👥 **权限管理** - 三级权限体系（admin/agent/staff）
- 📱 **移动端优化** - 完整的响应式设计，支持手机访问

---

## 🚀 快速开始

### 环境要求

- Node.js >= 22.18.0
- PostgreSQL >= 14
- Nginx（生产环境）
- PM2（生产环境）

### 本地开发

#### 1. 克隆项目
```bash
git clone https://github.com/latiaodream/hgzuqiu.git
cd hgzuqiu
```

#### 2. 安装依赖
```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

#### 3. 配置数据库
```bash
# 创建数据库
createdb bclogin_system

# 导入数据库结构
psql -d bclogin_system -f database/schema.sql

# 运行迁移
cd backend
npm run migrate
```

#### 4. 配置环境变量
```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等信息
```

#### 5. 启动服务
```bash
# 启动后端（端口 3000）
cd backend
npm run dev

# 启动前端（端口 5173）
cd frontend
npm run dev
```

#### 6. 访问系统
- 前端：http://localhost:5173
- 后端API：http://localhost:3000/api
- 默认账号：admin / 123456

### 生产部署

详细的部署指南请查看 [完整文档 - 部署指南](./PROJECT_DOCUMENTATION.md#部署指南)

---

## 🏗️ 技术架构

### 技术栈

#### 后端
- **运行环境**：Node.js v22.18.0
- **开发语言**：TypeScript 5.9.2
- **Web框架**：Express 5.1.0
- **数据库**：PostgreSQL 14+
- **身份认证**：JWT
- **密码加密**：bcrypt
- **定时任务**：cron

#### 前端
- **开发语言**：TypeScript 5.8.3
- **UI框架**：React 18.3.1
- **构建工具**：Vite 7.1.7
- **UI组件库**：Ant Design 5.27.4
- **路由管理**：React Router DOM 6.28.0

### 系统架构

```
┌─────────────┐
│   用户层    │  管理员 / 代理 / 员工
└──────┬──────┘
       │
┌──────┴──────┐
│   前端层    │  React + TypeScript + Ant Design
└──────┬──────┘
       │ REST API
┌──────┴──────┐
│   后端层    │  Express + TypeScript + JWT
└──────┬──────┘
       │
┌──────┴──────┐
│   数据层    │  PostgreSQL
└──────┬──────┘
       │
┌──────┴──────┐
│  外部服务   │  皇冠平台 API
└─────────────┘
```

---

## 📁 项目结构

```
bclogin-system/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── app.ts             # 应用入口
│   │   ├── models/            # 数据模型
│   │   ├── routes/            # API路由
│   │   ├── services/          # 业务服务
│   │   ├── middleware/        # 中间件
│   │   └── types/             # 类型定义
│   ├── migrations/            # 数据库迁移
│   └── package.json
│
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── main.tsx           # 应用入口
│   │   ├── App.tsx            # 根组件
│   │   ├── pages/             # 页面组件
│   │   ├── components/        # 公共组件
│   │   ├── services/          # API服务
│   │   ├── contexts/          # React Context
│   │   └── types/             # 类型定义
│   └── package.json
│
├── database/                   # 数据库脚本
│   ├── schema.sql             # 数据库结构
│   └── migrations/            # 迁移脚本
│
├── PROJECT_DOCUMENTATION.md   # 完整项目文档
└── README.md                  # 项目说明
```

---

## 📊 数据库设计

### 核心数据表

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| users | 用户表 | id, username, email, role, agent_id |
| crown_accounts | 皇冠账号表 | id, username, password, balance, discount |
| matches | 赛事表 | id, match_id, league_name, home_team, away_team |
| bets | 下注记录表 | id, user_id, account_id, bet_amount, odds, result, score |
| coin_transactions | 金币流水表 | id, user_id, amount, balance_before, balance_after |
| groups | 分组表 | id, user_id, name |
| settings | 设置表 | id, user_id, setting_key, setting_value |

详细的数据库设计请查看 [完整文档 - 数据库设计](./PROJECT_DOCUMENTATION.md#数据库设计)

---

## 🔌 API 接口

### 主要接口

- **认证接口** - `/api/auth/*` - 登录、注册、获取用户信息
- **账号管理** - `/api/accounts/*` - CRUD操作、测试登录
- **赛事管理** - `/api/matches/*` - 获取赛事、同步数据
- **下注记录** - `/api/bets/*` - 创建下注、查询记录、同步结算
- **金币流水** - `/api/coins/*` - 查询流水、统计数据
- **代理管理** - `/api/agents/*` - 管理代理、充值金币
- **员工管理** - `/api/staff/*` - 管理员工

详细的API文档请查看 [完整文档 - API接口文档](./PROJECT_DOCUMENTATION.md#api接口文档)

---

## 🔧 开发指南

### 代码规范
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 使用 Conventional Commits 提交规范

### 数据库迁移
```bash
# 创建迁移文件
cd backend/migrations
touch YYYYMMDD_description.sql

# 运行迁移
cd backend
npm run migrate
```

### 调试技巧
```bash
# 查看后端日志
pm2 logs bclogin-backend

# 连接数据库
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu

# 重启服务
pm2 restart bclogin-backend
```

详细的开发指南请查看 [完整文档 - 开发指南](./PROJECT_DOCUMENTATION.md#开发指南)

---

## ❓ 常见问题

### 数据库连接失败
检查 PostgreSQL 服务状态和配置文件

### 同步结算失败
确保数据库有 `score` 列，检查皇冠账号状态

### 移动端显示异常
清除浏览器缓存，使用最新的 CSS

更多问题请查看 [完整文档 - 常见问题](./PROJECT_DOCUMENTATION.md#常见问题)

---

## 📝 更新日志

### 2025-10-27
- ✅ 修复：添加 `score` 列到 `bets` 表，解决同步结算失败问题
- ✅ 优化：完成所有页面的移动端响应式优化
- ✅ 优化：赛事管理页面盘口显示优化
- ✅ 修复：admin 用户查看下注记录权限问题
- ✅ 文档：添加完整的项目文档

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

---

## 📞 联系方式

- **项目地址**：https://github.com/latiaodream/hgzuqiu
- **线上地址**：https://aibcbot.top
- **问题反馈**：[GitHub Issues](https://github.com/latiaodream/hgzuqiu/issues)

---

## 🙏 致谢

感谢所有为本项目做出贡献的开发者！

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star！⭐**

Made with ❤️ by Development Team

</div>
