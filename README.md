# 智投系统 - 皇冠足球下注管理平台

一个完整的皇冠足球下注管理系统，支持多账号管理、自动化下注、金币流水管理等功能。

## 项目概述

本系统是根据参考截图开发的"智投"系统，专门用于管理皇冠足球下注账号和下注流程，具有现代化的UI设计和完整的后端API支持。

## 技术栈

### 前端 (Frontend)
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI组件库**: Ant Design 5.x
- **路由**: React Router v6
- **状态管理**: React Context API
- **HTTP客户端**: Axios
- **日期处理**: Day.js

### 后端 (Backend)
- **运行时**: Node.js + TypeScript
- **框架**: Express.js 5.x
- **数据库**: PostgreSQL
- **认证**: JWT (JSON Web Tokens)
- **密码加密**: bcrypt
- **自动化**: Playwright (用于皇冠网站集成)
- **开发工具**: ts-node, nodemon

### 数据库
- **主数据库**: PostgreSQL
- **数据表**: 用户、分组、账号、比赛、下注、金币交易

## 主要功能

### ✅ 已完成功能

1. **用户认证系统**
   - 用户注册/登录
   - JWT token认证
   - 自动token刷新
   - 密码加密存储

2. **主界面布局**
   - 响应式侧边栏导航
   - 现代化UI设计
   - 用户信息显示
   - 系统概览仪表板

3. **账号管理 (核心功能)**
   - 皇冠账号CRUD操作
   - 分组管理功能
   - 批量账号操作
   - 代理IP配置
   - 限额设置管理
   - 账号状态切换

4. **分组管理**
   - 分组创建/编辑/删除
   - 账号数量统计
   - 分组关联验证

5. **下注管理界面**
   - 可下注比赛列表
   - 多账号批量下注
   - 下注记录查看
   - 实时统计数据
   - 下注状态追踪

6. **完整的后端API**
   - RESTful API设计
   - 统一错误处理
   - 请求日志记录
   - 数据验证
   - 关联查询优化

### 🚧 开发中功能

7. **金币流水管理**
   - 金币交易记录
   - 余额查询
   - 流水分析统计
   - 收支明细

8. **皇冠网站自动化集成**
   - Playwright自动化登录
   - 反检测机制
   - 自动下注执行
   - 结果获取

## 项目结构

```
bclogin-system/
├── frontend/                 # React前端应用
│   ├── src/
│   │   ├── components/      # 可复用组件
│   │   ├── pages/          # 页面组件
│   │   ├── contexts/       # React Context
│   │   ├── services/       # API服务
│   │   ├── types/          # TypeScript类型定义
│   │   └── App.tsx         # 主应用组件
│   └── package.json
├── backend/                  # Node.js后端API
│   ├── src/
│   │   ├── routes/         # API路由
│   │   ├── middleware/     # 中间件
│   │   ├── models/         # 数据模型
│   │   ├── types/          # 类型定义
│   │   └── app.ts          # Express应用
│   └── package.json
├── database/                 # 数据库相关
│   └── schema.sql          # 数据库模式
└── README.md                # 项目文档
```

## 核心特性

### 账号管理系统
- **网格化显示**: 类似参考截图的账号网格布局
- **分组管理**: 一个分组可包含多个皇冠账号
- **代理支持**: HTTP/HTTPS/SOCKS5代理配置
- **限额管理**: 足球/篮球赛前/滚球限额设置
- **批量操作**: 支持批量启用/禁用账号

### 下注功能
- **多账号下注**: 一次下注可选择多个账号
- **参数配置**: 下注类型、选项、金额、赔率设置
- **实时统计**: 下注数量、金额、盈亏统计
- **状态追踪**: 待处理、已确认、已结算状态管理

### 安全特性
- **JWT认证**: 无状态token认证机制
- **密码加密**: bcrypt哈希加密
- **权限控制**: 基于用户的数据隔离
- **输入验证**: 前后端双重数据验证

## 开发进度

### ✅ 已完成 (95%)
- [x] 项目架构搭建
- [x] 数据库设计和实现
- [x] 用户认证系统
- [x] 主界面布局和导航
- [x] 账号管理功能 (网格界面)
- [x] 分组管理功能
- [x] 下注界面设计
- [x] 金币流水管理
- [x] 皇冠网站自动化集成
- [x] 反检测机制 (基础版)
- [x] 批量账号操作
- [x] 完整的后端API框架

### 🔧 可选优化 (5%)
- [ ] 系统设置页面
- [ ] 数据导出功能
- [ ] 高级反检测策略
- [ ] 实时监控面板

## 快速开始

### 环境要求
- Node.js 18+
- PostgreSQL 13+
- npm/yarn

### 安装和运行

1. **克隆项目**
```bash
git clone <project-url>
cd bclogin-system
```

2. **安装依赖**
```bash
# 安装前端依赖
cd frontend && npm install

# 安装后端依赖
cd ../backend && npm install
```

3. **配置数据库**
```bash
# 创建数据库
createdb bclogin_system

# 导入数据库结构
psql bclogin_system < database/schema.sql

# 运行增量迁移（补齐与代码一致的字段）
cd backend && npm run migrate && cd ..

# （可选）确保管理员账号存在（admin / 123456）
cd backend && npm run ensure-admin && cd ..
```

4. **配置环境变量**
```bash
# 复制配置文件
cp backend/.env.example backend/.env

# 编辑配置文件，设置数据库连接等
vim backend/.env
```

5. **启动服务**
```bash
# 启动后端服务 (端口3001)
cd backend && npm run dev

# 启动前端服务 (端口10087)
cd frontend && npm run dev
```

- 6. **访问应用**
- 前端: http://localhost:10087
- 后端API: http://localhost:3001

## API文档

### 认证接口
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

### 分组接口
- `GET /api/groups` - 获取分组列表
- `POST /api/groups` - 创建分组
- `PUT /api/groups/:id` - 更新分组
- `DELETE /api/groups/:id` - 删除分组

### 账号接口
- `GET /api/accounts` - 获取账号列表
- `POST /api/accounts` - 创建账号
- `PUT /api/accounts/:id` - 更新账号
- `DELETE /api/accounts/:id` - 删除账号
- `POST /api/accounts/batch-update-status` - 批量更新状态

### 比赛接口
- `GET /api/matches` - 获取比赛列表
- `GET /api/matches/:id` - 获取比赛详情
- `GET /api/matches/hot/list` - 获取热门比赛

### 下注接口
- `GET /api/bets` - 获取下注记录
- `POST /api/bets` - 创建下注
- `PUT /api/bets/:id/status` - 更新下注状态

### 金币接口
- `GET /api/coins` - 获取金币流水
- `POST /api/coins` - 创建金币交易
- `GET /api/coins/balance` - 获取余额
- `GET /api/coins/analytics` - 获取分析数据

### 皇冠自动化接口
- `POST /api/crown-automation/login/:accountId` - 登录皇冠账号
- `POST /api/crown-automation/logout/:accountId` - 登出皇冠账号
- `POST /api/crown-automation/bet/:accountId` - 执行自动下注
- `GET /api/crown-automation/balance/:accountId` - 获取皇冠账号余额
- `GET /api/crown-automation/status` - 获取自动化状态
- `POST /api/crown-automation/batch-login` - 批量登录账号
- `POST /api/crown-automation/batch-logout` - 批量登出账号

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

本项目仅供学习和研究使用。

## 联系方式

如有问题或建议，请通过以下方式联系：
- 邮箱: [your-email@example.com]
- 项目Issues: [GitHub Issues链接]

---

**注意**: 本系统仅用于技术学习和研究目的，请确保在合法合规的前提下使用。
