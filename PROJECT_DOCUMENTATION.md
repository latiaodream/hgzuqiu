# 智投系统 - 完整项目文档

## 📋 目录
1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [系统架构](#系统架构)
4. [数据库设计](#数据库设计)
5. [API接口文档](#api接口文档)
6. [部署指南](#部署指南)
7. [开发指南](#开发指南)
8. [常见问题](#常见问题)

---

## 项目概述

### 项目名称
**智投系统 - 皇冠足球下注管理平台**

### 项目简介
智投系统是一个专业的皇冠足球博彩管理平台，提供账号管理、赛事抓取、自动下注、结算同步、金币流水等完整功能。系统支持多级用户权限管理（管理员、代理、员工），实现了从赛事数据获取到下注结算的全流程自动化。

### 核心功能
- **账号管理**：管理皇冠平台账号，支持代理分配、设备配置、限额设置
- **赛事管理**：自动抓取皇冠平台赛事数据和实时赔率
- **智能下注**：支持批量下注、间隔下注、赔率控制
- **结算同步**：自动同步下注结果和盈亏数据
- **金币系统**：虚拟金币管理，用于权限控制和成本核算
- **数据看板**：实时统计下注数据、盈亏分析、回报率计算
- **权限管理**：三级权限体系（admin/agent/staff）

### 业务流程
1. **管理员**创建代理账号，分配金币额度
2. **代理**创建员工账号，添加皇冠账号到账号池
3. **员工**选择赛事和盘口，设置下注参数
4. **系统**自动执行下注任务，消耗金币
5. **系统**定时同步结算结果，更新盈亏数据
6. **用户**查看数据看板，分析投注效果

---

## 技术栈

### 后端技术
- **运行环境**：Node.js v22.18.0
- **开发语言**：TypeScript 5.9.2
- **Web框架**：Express 5.1.0
- **数据库**：PostgreSQL 14+
- **数据库客户端**：pg 8.16.3
- **身份认证**：JWT (jsonwebtoken 9.0.2)
- **密码加密**：bcrypt 6.0.0
- **HTTP客户端**：axios 1.12.2
- **定时任务**：cron 4.3.3
- **日期处理**：dayjs 1.11.18
- **XML解析**：xml2js 0.6.2, fast-xml-parser 5.3.0
- **代理支持**：https-proxy-agent 7.0.6, socks-proxy-agent 8.0.5
- **进程管理**：PM2

### 前端技术
- **开发语言**：TypeScript 5.8.3
- **UI框架**：React 18.3.1
- **构建工具**：Vite 7.1.7
- **UI组件库**：Ant Design 5.27.4
- **路由管理**：React Router DOM 6.28.0
- **HTTP客户端**：axios 1.12.2
- **日期处理**：dayjs 1.11.18
- **图标库**：@ant-design/icons 5.3.7

### 服务器环境
- **操作系统**：Ubuntu 22.04.5 LTS
- **Web服务器**：Nginx
- **进程管理**：PM2
- **服务器IP**：47.238.112.207
- **域名**：https://aibcbot.top

---

## 系统架构

### 目录结构
```
bclogin-system/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── app.ts             # 应用入口
│   │   ├── models/            # 数据模型
│   │   │   └── database.ts    # 数据库连接
│   │   ├── routes/            # API路由
│   │   │   ├── auth.ts        # 认证接口
│   │   │   ├── accounts.ts    # 账号管理
│   │   │   ├── agents.ts      # 代理管理
│   │   │   ├── staff.ts       # 员工管理
│   │   │   ├── matches.ts     # 赛事管理
│   │   │   ├── bets.ts        # 下注记录
│   │   │   ├── coins.ts       # 金币流水
│   │   │   ├── crown-sites.ts # 站点管理
│   │   │   ├── crown-automation.ts # 皇冠自动化
│   │   │   ├── account-shares.ts   # 账号共享
│   │   │   └── groups.ts      # 分组管理
│   │   ├── services/          # 业务服务
│   │   ├── middleware/        # 中间件
│   │   └── types/             # 类型定义
│   ├── migrations/            # 数据库迁移
│   ├── dist/                  # 编译输出
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── main.tsx           # 应用入口
│   │   ├── App.tsx            # 根组件
│   │   ├── App.css            # 全局样式
│   │   ├── pages/             # 页面组件
│   │   │   ├── DashboardPage.tsx    # 数据看板
│   │   │   ├── AccountsPage.tsx     # 账号管理
│   │   │   ├── AgentsPage.tsx       # 代理管理
│   │   │   ├── StaffPage.tsx        # 员工管理
│   │   │   ├── MatchesPage.tsx      # 赛事管理
│   │   │   ├── BettingPage.tsx      # 下注记录
│   │   │   ├── CoinsPage.tsx        # 金币流水
│   │   │   ├── CrownSitesPage.tsx   # 站点管理
│   │   │   ├── FetchAccountsPage.tsx # 赛事抓取账号
│   │   │   ├── SettingsPage.tsx     # 个人中心
│   │   │   └── AuthPage.tsx         # 登录页面
│   │   ├── components/        # 组件
│   │   │   ├── Layout/        # 布局组件
│   │   │   ├── Auth/          # 认证组件
│   │   │   ├── Accounts/      # 账号组件
│   │   │   └── Betting/       # 下注组件
│   │   ├── services/          # API服务
│   │   │   ├── api.ts         # API客户端
│   │   │   └── accountShareApi.ts # 账号共享API
│   │   ├── contexts/          # React Context
│   │   │   └── AuthContext.tsx # 认证上下文
│   │   ├── types/             # 类型定义
│   │   └── utils/             # 工具函数
│   ├── dist/                  # 构建输出
│   ├── package.json
│   └── vite.config.ts
│
├── database/                   # 数据库脚本
│   ├── schema.sql             # 数据库结构
│   └── migrations/            # 迁移脚本
│
└── PROJECT_DOCUMENTATION.md   # 项目文档
```

### 系统架构图
```
┌─────────────────────────────────────────────────────────────┐
│                         用户层                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  管理员  │  │   代理   │  │   员工   │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
└───────┼─────────────┼─────────────┼────────────────────────┘
        │             │             │
        └─────────────┴─────────────┘
                      │
┌─────────────────────┼─────────────────────────────────────┐
│                     ▼          前端层                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  React + TypeScript + Ant Design + Vite             │ │
│  │  - 数据看板  - 账号管理  - 赛事管理  - 下注记录     │ │
│  │  - 代理管理  - 员工管理  - 金币流水  - 站点管理     │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS/REST API
┌─────────────────────┼───────────────────────────────────────┐
│                     ▼          后端层                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Express + TypeScript + JWT                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │ 认证中间件 │  │ 权限控制   │  │ 错误处理   │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘     │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │              API路由层                         │ │  │
│  │  │  /auth  /accounts  /matches  /bets  /coins    │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │              业务服务层                        │ │  │
│  │  │  - 皇冠自动化服务  - 赛事同步服务             │ │  │
│  │  │  - 下注执行服务    - 结算同步服务             │ │  │
│  │  │  - 金币管理服务    - 定时任务服务             │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ PostgreSQL Protocol
┌─────────────────────┼───────────────────────────────────────┐
│                     ▼          数据层                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PostgreSQL 14+                                      │  │
│  │  - users (用户表)                                    │  │
│  │  - crown_accounts (皇冠账号表)                       │  │
│  │  - matches (赛事表)                                  │  │
│  │  - bets (下注记录表)                                 │  │
│  │  - coin_transactions (金币流水表)                   │  │
│  │  - groups (分组表)                                   │  │
│  │  - settings (设置表)                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────────┐
│                     ▼          外部服务                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  皇冠平台 API                                        │  │
│  │  - 赛事数据接口  - 赔率数据接口                     │  │
│  │  - 下注接口      - 结算查询接口                     │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## 数据库设计

### 数据库连接配置
```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=hgzuqiu
DB_USER=hgzuqiu
DB_PASSWORD=AbDN22pKhcsNnJSk
```

### 表结构详解

#### 1. users - 用户表
存储系统用户信息，支持三级权限体系。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | SERIAL | PRIMARY KEY | 用户ID，自增主键 |
| username | VARCHAR(50) | UNIQUE NOT NULL | 用户名，唯一 |
| email | VARCHAR(100) | UNIQUE NOT NULL | 邮箱，唯一 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希值（bcrypt加密） |
| role | VARCHAR(20) | NOT NULL DEFAULT 'staff' | 角色：admin（管理员）、agent（代理）、staff（员工） |
| parent_id | INTEGER | REFERENCES users(id) | 上级用户ID，用于层级关系 |
| agent_id | INTEGER | REFERENCES users(id) | 所属代理ID，员工关联到代理 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**权限说明**：
- **admin**：超级管理员，可以查看所有数据，管理所有用户
- **agent**：代理，可以创建员工，查看自己和下属员工的数据
- **staff**：员工，只能查看自己的数据

**索引**：
- `idx_users_role` ON (role)
- `idx_users_parent_id` ON (parent_id)
- `idx_users_agent_id` ON (agent_id)

#### 2. groups - 分组表
用于组织和管理皇冠账号的分组。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | SERIAL | PRIMARY KEY | 分组ID，自增主键 |
| user_id | INTEGER | NOT NULL REFERENCES users(id) | 所属用户ID |
| name | VARCHAR(100) | NOT NULL | 分组名称 |
| description | TEXT | | 分组描述 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

#### 3. crown_accounts - 皇冠账号表
存储皇冠平台账号的完整信息，包括登录凭证、财务信息、设备配置、代理设置等。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| **基本信息** |
| id | SERIAL | PRIMARY KEY | 账号ID，自增主键 |
| user_id | INTEGER | NOT NULL REFERENCES users(id) | 所属用户ID |
| group_id | INTEGER | NOT NULL REFERENCES groups(id) | 所属分组ID |
| username | VARCHAR(100) | NOT NULL | 皇冠账号用户名 |
| password | VARCHAR(255) | NOT NULL | 皇冠账号密码（加密存储） |
| passcode | VARCHAR(20) | | 四位简易登录密码 |
| display_name | VARCHAR(100) | | 显示名称，如：G1aokloz (cfax5g2hoz) |
| original_username | VARCHAR(100) | | 原始账号（首次登录时的账号） |
| initialized_username | VARCHAR(100) | | 修改后的账号（初始化后使用的账号） |
| **平台信息** |
| platform | VARCHAR(50) | DEFAULT '皇冠' | 平台名称 |
| game_type | VARCHAR(50) | DEFAULT '足球' | 游戏类型：足球、篮球等 |
| source | VARCHAR(50) | DEFAULT '自有' | 来源：自有、共享 |
| share_count | INTEGER | DEFAULT 0 | 分享数量 |
| **财务信息** |
| currency | VARCHAR(10) | DEFAULT 'CNY' | 币种：CNY、USD等 |
| discount | DECIMAL(3,2) | DEFAULT 1.00 | 折扣率：0.8、0.85、1.0 |
| note | VARCHAR(50) | | 备注：高、中、低 |
| balance | DECIMAL(15,2) | DEFAULT 0 | 账号余额 |
| stop_profit_limit | DECIMAL(15,2) | DEFAULT 0 | 止盈金额 |
| **设备信息** |
| device_type | VARCHAR(50) | | 设备类型：iPhone 14、iPhone 15、iPhone 11 |
| user_agent | TEXT | | 用户代理字符串，用于模拟设备 |
| **代理信息** |
| proxy_enabled | BOOLEAN | DEFAULT false | 是否启用代理 |
| proxy_type | VARCHAR(10) | | 代理类型：http、socks5 |
| proxy_host | VARCHAR(255) | | 代理服务器地址 |
| proxy_port | INTEGER | | 代理服务器端口 |
| proxy_username | VARCHAR(100) | | 代理认证用户名 |
| proxy_password | VARCHAR(255) | | 代理认证密码 |
| **归属信息** |
| agent_id | INTEGER | REFERENCES users(id) | 所属代理ID |
| use_for_fetch | BOOLEAN | DEFAULT false | 是否用于赛事抓取 |
| **限额设置** |
| football_prematch_limit | DECIMAL(15,2) | DEFAULT 100000 | 足球赛前单笔限额 |
| football_live_limit | DECIMAL(15,2) | DEFAULT 100000 | 足球滚球单笔限额 |
| basketball_prematch_limit | DECIMAL(15,2) | DEFAULT 100000 | 篮球赛前单笔限额 |
| basketball_live_limit | DECIMAL(15,2) | DEFAULT 100000 | 篮球滚球单笔限额 |
| **状态管理** |
| is_enabled | BOOLEAN | DEFAULT true | 是否启用 |
| is_online | BOOLEAN | DEFAULT false | 是否在线 |
| last_login_at | TIMESTAMP | | 最后登录时间 |
| status | VARCHAR(20) | DEFAULT 'active' | 状态：active（正常）、disabled（禁用）、error（错误） |
| error_message | TEXT | | 错误信息 |
| **时间戳** |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**索引**：
- `idx_crown_accounts_user_id` ON (user_id)
- `idx_crown_accounts_group_id` ON (group_id)
- `idx_crown_accounts_status` ON (status)
- `idx_crown_accounts_agent_id` ON (agent_id)
- `idx_crown_accounts_use_for_fetch` ON (use_for_fetch)

#### 4. matches - 赛事表
存储从皇冠平台抓取的赛事信息和实时赔率。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| **基本信息** |
| id | SERIAL | PRIMARY KEY | 赛事ID，自增主键 |
| match_id | VARCHAR(100) | UNIQUE NOT NULL | 官网比赛ID，唯一标识 |
| league_name | VARCHAR(200) | NOT NULL | 联赛名称，如：西班牙甲组联赛 |
| home_team | VARCHAR(100) | NOT NULL | 主队名称 |
| away_team | VARCHAR(100) | NOT NULL | 客队名称 |
| match_time | TIMESTAMP | NOT NULL | 比赛开始时间 |
| **比赛状态** |
| status | VARCHAR(20) | DEFAULT 'scheduled' | 状态：scheduled（未开始）、live（进行中）、finished（已结束）、cancelled（已取消） |
| current_score | VARCHAR(20) | | 当前比分，如：3-0 |
| match_period | VARCHAR(20) | | 比赛阶段，如：2H*89:41（下半场89分41秒） |
| markets | JSONB | | 盘口/赔率原始JSON结构 |
| last_synced_at | TIMESTAMP | | 最近一次从官网同步时间 |
| **全场赔率** |
| odds_home_win | DECIMAL(5,2) | | 主胜赔率（独赢） |
| odds_draw | DECIMAL(5,2) | | 平局赔率（独赢） |
| odds_away_win | DECIMAL(5,2) | | 客胜赔率（独赢） |
| odds_handicap | DECIMAL(5,2) | | 让球赔率 |
| odds_over | DECIMAL(5,2) | | 大球赔率 |
| odds_under | DECIMAL(5,2) | | 小球赔率 |
| **半场赔率** |
| odds_home_win_half | DECIMAL(5,2) | | 半场主胜赔率 |
| odds_draw_half | DECIMAL(5,2) | | 半场平局赔率 |
| odds_away_win_half | DECIMAL(5,2) | | 半场客胜赔率 |
| odds_handicap_half | DECIMAL(5,2) | | 半场让球赔率 |
| odds_over_half | DECIMAL(5,2) | | 半场大球赔率 |
| odds_under_half | DECIMAL(5,2) | | 半场小球赔率 |
| **时间戳** |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**索引**：
- `idx_matches_status` ON (status)
- `idx_matches_match_time` ON (match_time)

#### 5. bets - 下注记录表
存储所有下注记录，包括下注参数、状态、结算结果等完整信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| **基本信息** |
| id | SERIAL | PRIMARY KEY | 下注记录ID，自增主键 |
| user_id | INTEGER | NOT NULL REFERENCES users(id) | 下注用户ID |
| account_id | INTEGER | NOT NULL REFERENCES crown_accounts(id) | 使用的皇冠账号ID |
| match_id | INTEGER | NOT NULL REFERENCES matches(id) | 关联的赛事ID |
| **下注信息** |
| bet_type | VARCHAR(50) | NOT NULL | 投注类型：独赢、让球、大小球、半场独赢、半场让球、半场大小球 |
| bet_option | VARCHAR(100) | NOT NULL | 具体选项，如：[盘前]全场主队-0.5@0.88 |
| bet_amount | DECIMAL(15,2) | NOT NULL | 投注金额（实际金额） |
| odds | DECIMAL(5,2) | NOT NULL | 投注时的赔率 |
| min_odds | DECIMAL(6,3) | | 下注时用户设置的最低赔率 |
| official_odds | DECIMAL(6,3) | | 皇冠返回的真实赔率 |
| **下注设置** |
| single_limit | DECIMAL(15,2) | | 单笔限额 |
| interval_seconds | INTEGER | DEFAULT 3 | 间隔时间（秒），用于批量下注 |
| quantity | INTEGER | DEFAULT 1 | 下注数量 |
| **状态和结果** |
| status | VARCHAR(20) | DEFAULT 'pending' | 状态：pending（待处理）、confirmed（已下单）、cancelled（已取消）、settled（已结算） |
| result | VARCHAR(20) | | 结果：win（赢）、lose（输）、draw（平）、cancelled（取消） |
| payout | DECIMAL(15,2) | DEFAULT 0 | 派彩金额 |
| profit_loss | DECIMAL(15,2) | DEFAULT 0 | 盈亏金额（正数为盈利，负数为亏损） |
| score | VARCHAR(50) | | 比赛比分，如：1-1、2-0 |
| **虚拟金额** |
| virtual_bet_amount | DECIMAL(15,2) | | 虚拟下注金额（用于折扣计算） |
| virtual_profit_loss | DECIMAL(15,2) | | 虚拟盈亏金额 |
| result_score | VARCHAR(50) | | 结算比分 |
| result_text | VARCHAR(255) | | 结算文本 |
| **官网信息** |
| official_bet_id | VARCHAR(100) | | 官网下注单号，如：22870402347 |
| confirmed_at | TIMESTAMP | | 确认时间（下注成功时间） |
| settled_at | TIMESTAMP | | 结算时间 |
| **时间戳** |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**字段说明**：
- **bet_amount vs virtual_bet_amount**：实际金额是皇冠账号实际下注的金额，虚拟金额是根据折扣计算的平台金额
- **profit_loss vs virtual_profit_loss**：实际盈亏是皇冠账号的盈亏，虚拟盈亏是平台的盈亏
- **status 状态流转**：pending → confirmed → settled/cancelled
- **score**：比赛比分，从皇冠API的 `ballActRet` 字段获取

**索引**：
- `idx_bets_user_id` ON (user_id)
- `idx_bets_account_id` ON (account_id)
- `idx_bets_status` ON (status)
- `idx_bets_created_at` ON (created_at)

#### 6. coin_transactions - 金币流水表
记录所有金币变动，包括消耗、返还、转账等操作。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| **基本信息** |
| id | SERIAL | PRIMARY KEY | 流水ID，自增主键 |
| user_id | INTEGER | NOT NULL REFERENCES users(id) | 用户ID |
| account_id | INTEGER | REFERENCES crown_accounts(id) | 关联的皇冠账号ID（可为空） |
| bet_id | INTEGER | REFERENCES bets(id) | 关联的下注记录ID（可为空） |
| **流水信息** |
| transaction_id | VARCHAR(100) | UNIQUE NOT NULL | 流水号，唯一标识，如：ZMZOrXUdaDksA88pzCnFN |
| transaction_type | VARCHAR(50) | NOT NULL | 类型：消耗、返还、转账、收款、充值、提现 |
| description | TEXT | | 描述，如：cb1995959票单[GsC_wTyX2LmiZYm_Eo3]消耗 |
| **金额变化** |
| amount | DECIMAL(15,2) | NOT NULL | 变动金额（正数为收入，负数为支出） |
| balance_before | DECIMAL(15,2) | NOT NULL | 变动前余额 |
| balance_after | DECIMAL(15,2) | NOT NULL | 变动后余额 |
| **时间戳** |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**业务逻辑**：
- **消耗**：下注时扣除金币，amount为负数
- **返还**：下注被取消时返还金币，amount为正数
- **转账**：代理给员工转账，转出方amount为负数，转入方amount为正数
- **充值**：管理员给代理充值，amount为正数

**索引**：
- `idx_coin_transactions_user_id` ON (user_id)
- `idx_coin_transactions_created_at` ON (created_at)

#### 7. settings - 系统设置表
存储用户的个性化设置。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | SERIAL | PRIMARY KEY | 设置ID，自增主键 |
| user_id | INTEGER | NOT NULL REFERENCES users(id) | 用户ID |
| setting_key | VARCHAR(100) | NOT NULL | 设置键名 |
| setting_value | TEXT | | 设置值（JSON格式） |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**唯一约束**：(user_id, setting_key)

#### 8. account_shares - 账号共享表
管理账号共享关系。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | SERIAL | PRIMARY KEY | 共享记录ID |
| account_id | INTEGER | NOT NULL REFERENCES crown_accounts(id) | 被共享的账号ID |
| shared_to_user_id | INTEGER | NOT NULL REFERENCES users(id) | 共享给的用户ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

#### 9. account_history - 账号历史记录表
记录账号的操作历史。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | SERIAL | PRIMARY KEY | 历史记录ID |
| account_id | INTEGER | NOT NULL REFERENCES crown_accounts(id) | 账号ID |
| action | VARCHAR(50) | NOT NULL | 操作类型：login、logout、bet、error等 |
| details | JSONB | | 操作详情（JSON格式） |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

---

## API接口文档

### 基础信息
- **Base URL**：`https://aibcbot.top/api`
- **认证方式**：JWT Token（Bearer Token）
- **请求头**：
  ```
  Authorization: Bearer <token>
  Content-Type: application/json
  ```

### 通用响应格式
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

### 1. 认证接口 (/api/auth)

#### 1.1 用户登录
```
POST /api/auth/login
```

**请求体**：
```json
{
  "username": "zhuren",
  "password": "123456"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "zhuren",
      "email": "zhuren@example.com",
      "role": "admin"
    }
  }
}
```

#### 1.2 获取当前用户信息
```
GET /api/auth/me
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "zhuren",
    "email": "zhuren@example.com",
    "role": "admin",
    "balance": 99500.00
  }
}
```

### 2. 账号管理接口 (/api/accounts)

#### 2.1 获取账号列表
```
GET /api/accounts?page=1&pageSize=20
```

#### 2.2 创建账号
```
POST /api/accounts
```

#### 2.3 更新账号
```
PUT /api/accounts/:id
```

#### 2.4 删除账号
```
DELETE /api/accounts/:id
```

#### 2.5 测试账号登录
```
POST /api/accounts/:id/test-login
```

### 3. 赛事管理接口 (/api/matches)

#### 3.1 获取赛事列表
```
GET /api/matches?date=2025-10-27&status=scheduled
```

#### 3.2 同步赛事数据
```
POST /api/matches/sync
```

#### 3.3 获取赛事详情
```
GET /api/matches/:id
```

### 4. 下注记录接口 (/api/bets)

#### 4.1 获取下注列表
```
GET /api/bets?date=2025-10-27&status=settled
```

#### 4.2 获取下注统计
```
GET /api/bets/stats?date=2025-10-27
```

**响应**：
```json
{
  "success": true,
  "data": {
    "totalTickets": 17,
    "totalBets": 25,
    "totalAmount": 2500,
    "profitLoss": -43,
    "returnRate": -1.7,
    "unsettled": 0,
    "cancelled": 2
  }
}
```

#### 4.3 创建下注
```
POST /api/bets
```

**请求体**：
```json
{
  "accountId": 1,
  "matchId": 123,
  "betType": "大小球",
  "betOption": "[盘前]全场小球(1)@1.13",
  "betAmount": 300,
  "odds": 1.13,
  "minOdds": 1.10,
  "quantity": 1,
  "intervalSeconds": 3
}
```

#### 4.4 同步结算结果
```
POST /api/bets/sync-settlements
```

**请求体**：
```json
{
  "account_ids": [1, 2, 3]  // 可选，不传则同步所有账号
}
```

**响应**：
```json
{
  "success": true,
  "message": "同步完成，更新 5 条注单",
  "data": {
    "updated_bets": [
      {
        "id": 123,
        "ticketId": "22870402347",
        "status": "settled",
        "result": "win",
        "payout": 469.5,
        "profit_loss": 169.5,
        "score": "1-1"
      }
    ],
    "errors": [],
    "skipped": []
  }
}
```

### 5. 金币流水接口 (/api/coins)

#### 5.1 获取流水列表
```
GET /api/coins?page=1&pageSize=20&type=消耗
```

#### 5.2 获取流水统计
```
GET /api/coins/stats?startDate=2025-10-01&endDate=2025-10-27
```

### 6. 代理管理接口 (/api/agents)

#### 6.1 获取代理列表
```
GET /api/agents
```

#### 6.2 创建代理
```
POST /api/agents
```

#### 6.3 给代理充值
```
POST /api/agents/:id/recharge
```

### 7. 员工管理接口 (/api/staff)

#### 7.1 获取员工列表
```
GET /api/staff
```

#### 7.2 创建员工
```
POST /api/staff
```

---

## 部署指南

### 服务器环境要求
- **操作系统**：Ubuntu 22.04 LTS 或更高版本
- **Node.js**：v22.18.0 或更高版本
- **PostgreSQL**：14 或更高版本
- **Nginx**：最新稳定版
- **PM2**：最新版本

### 1. 服务器初始化

#### 1.1 更新系统
```bash
sudo apt update && sudo apt upgrade -y
```

#### 1.2 安装 Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # 验证安装
```

#### 1.3 安装 PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### 1.4 安装 Nginx
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### 1.5 安装 PM2
```bash
sudo npm install -g pm2
```

### 2. 数据库配置

#### 2.1 创建数据库和用户
```bash
sudo -u postgres psql

# 在 PostgreSQL 命令行中执行：
CREATE DATABASE hgzuqiu;
CREATE USER hgzuqiu WITH PASSWORD 'AbDN22pKhcsNnJSk';
GRANT ALL PRIVILEGES ON DATABASE hgzuqiu TO hgzuqiu;
\q
```

#### 2.2 导入数据库结构
```bash
cd /www/wwwroot/aibcbot.top
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -f database/schema.sql
```

#### 2.3 运行数据库迁移
```bash
cd backend
npm run migrate
```

### 3. 后端部署

#### 3.1 克隆代码
```bash
cd /www/wwwroot
git clone <repository-url> aibcbot.top
cd aibcbot.top
```

#### 3.2 配置环境变量
```bash
cd backend
cp .env.example .env
nano .env
```

**环境变量配置**：
```env
# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=hgzuqiu
DB_USER=hgzuqiu
DB_PASSWORD=AbDN22pKhcsNnJSk

# JWT配置
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# 服务器配置
PORT=3000
NODE_ENV=production

# 皇冠平台配置
CROWN_API_BASE_URL=https://hga050.com
CROWN_BACKUP_URLS=hga026.com,hga027.com,hga030.com,hga035.com,hga038.com,hga039.com,hga050.com
```

#### 3.3 安装依赖
```bash
npm install
```

#### 3.4 构建项目
```bash
npm run build
```

#### 3.5 启动后端服务
```bash
pm2 start dist/app.js --name bclogin-backend
pm2 save
pm2 startup
```

### 4. 前端部署

#### 4.1 安装依赖
```bash
cd ../frontend
npm install
```

#### 4.2 构建前端
```bash
npm run build
```

### 5. Nginx 配置

#### 5.1 创建 Nginx 配置文件
```bash
sudo nano /etc/nginx/sites-available/aibcbot.top
```

**配置内容**：
```nginx
server {
    listen 80;
    server_name aibcbot.top www.aibcbot.top;

    # 前端静态文件
    root /www/wwwroot/aibcbot.top/frontend/dist;
    index index.html;

    # 前端路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 5.2 启用配置
```bash
sudo ln -s /etc/nginx/sites-available/aibcbot.top /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL 证书配置（可选）

#### 6.1 安装 Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 6.2 获取证书
```bash
sudo certbot --nginx -d aibcbot.top -d www.aibcbot.top
```

### 7. 创建管理员账号
```bash
cd /www/wwwroot/aibcbot.top/backend
node ensure-admin.js
```

---

## 开发指南

### 本地开发环境搭建

#### 1. 克隆项目
```bash
git clone <repository-url>
cd bclogin-system
```

#### 2. 安装依赖

**后端**：
```bash
cd backend
npm install
```

**前端**：
```bash
cd frontend
npm install
```

#### 3. 配置数据库
```bash
# 创建本地数据库
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
# 编辑 .env 文件，配置本地数据库连接
```

#### 5. 启动开发服务器

**后端**：
```bash
cd backend
npm run dev  # 启动在 http://localhost:3000
```

**前端**：
```bash
cd frontend
npm run dev  # 启动在 http://localhost:5173
```

### 代码规范

#### TypeScript 规范
- 使用严格模式（strict mode）
- 所有函数必须有明确的返回类型
- 避免使用 `any` 类型，使用 `unknown` 或具体类型
- 使用接口（interface）定义数据结构

#### 命名规范
- **文件名**：使用 kebab-case（如：`user-service.ts`）
- **组件名**：使用 PascalCase（如：`AccountCard.tsx`）
- **变量名**：使用 camelCase（如：`userName`）
- **常量名**：使用 UPPER_SNAKE_CASE（如：`MAX_RETRY_COUNT`）
- **接口名**：使用 PascalCase，以 `I` 开头（如：`IUser`）
- **类型名**：使用 PascalCase（如：`UserRole`）

#### Git 提交规范
使用 Conventional Commits 规范：
- `feat:` 新功能
- `fix:` 修复bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具相关

示例：
```bash
git commit -m "feat: 添加账号批量导入功能"
git commit -m "fix: 修复下注结算同步失败问题"
```

### 数据库迁移

#### 创建新的迁移文件
```bash
cd backend/migrations
touch YYYYMMDD_description.sql
```

#### 迁移文件格式
```sql
-- 描述迁移的目的
-- 日期：YYYY-MM-DD

-- 添加新列
ALTER TABLE table_name ADD COLUMN column_name TYPE;

-- 添加注释
COMMENT ON COLUMN table_name.column_name IS '字段说明';
```

#### 运行迁移
```bash
cd backend
npm run migrate
```

### 调试技巧

#### 后端调试
1. 查看 PM2 日志：
```bash
pm2 logs bclogin-backend
pm2 logs bclogin-backend --lines 100
```

2. 查看实时日志：
```bash
pm2 logs bclogin-backend --lines 0
```

3. 重启服务：
```bash
pm2 restart bclogin-backend
```

#### 前端调试
1. 使用 Chrome DevTools
2. 查看 Network 面板检查 API 请求
3. 使用 React DevTools 查看组件状态

#### 数据库调试
1. 连接数据库：
```bash
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu
```

2. 查看表结构：
```sql
\d table_name
```

3. 查看所有表：
```sql
\dt
```

4. 查询数据：
```sql
SELECT * FROM bets WHERE status = 'pending' LIMIT 10;
```

---

## 常见问题

### 1. 数据库相关

#### Q: 数据库连接失败
**A**: 检查以下几点：
1. PostgreSQL 服务是否启动：`sudo systemctl status postgresql`
2. 数据库配置是否正确：检查 `backend/.env` 文件
3. 数据库用户权限是否正确：
```sql
GRANT ALL PRIVILEGES ON DATABASE hgzuqiu TO hgzuqiu;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hgzuqiu;
```

#### Q: 缺少数据库列
**A**: 运行数据库迁移：
```bash
cd backend
npm run migrate
```

如果迁移失败，手动执行 SQL：
```bash
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -f migrations/xxx.sql
```

### 2. 后端相关

#### Q: 后端启动失败
**A**: 检查以下几点：
1. Node.js 版本是否正确：`node --version`（需要 v22+）
2. 依赖是否安装完整：`npm install`
3. 环境变量是否配置：检查 `.env` 文件
4. 端口是否被占用：`lsof -i :3000`

#### Q: JWT Token 验证失败
**A**:
1. 检查 `JWT_SECRET` 是否配置
2. Token 是否过期（默认24小时）
3. 前端是否正确发送 Authorization 头

#### Q: 同步结算失败
**A**:
1. 检查数据库是否有 `score` 列：
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bets' AND column_name = 'score';
```

2. 如果没有，添加列：
```sql
ALTER TABLE bets ADD COLUMN score VARCHAR(50);
```

3. 检查皇冠账号是否能正常登录
4. 查看后端日志：`pm2 logs bclogin-backend`

### 3. 前端相关

#### Q: 前端构建失败
**A**:
1. 清除缓存：`rm -rf node_modules package-lock.json && npm install`
2. 检查 Node.js 版本
3. 检查 TypeScript 版本兼容性

#### Q: API 请求失败（CORS 错误）
**A**:
1. 检查后端 CORS 配置
2. 检查 Nginx 配置中的 proxy_pass
3. 确保前端请求的 URL 正确

#### Q: 移动端显示异常
**A**:
1. 清除浏览器缓存
2. 检查是否使用了最新的 CSS
3. 使用 Chrome DevTools 的移动设备模拟器测试

### 4. 部署相关

#### Q: Nginx 配置不生效
**A**:
1. 测试配置：`sudo nginx -t`
2. 重新加载：`sudo systemctl reload nginx`
3. 检查日志：`sudo tail -f /var/log/nginx/error.log`

#### Q: PM2 进程异常退出
**A**:
1. 查看日志：`pm2 logs bclogin-backend --err`
2. 检查内存使用：`pm2 monit`
3. 重启进程：`pm2 restart bclogin-backend`

#### Q: 代码更新后不生效
**A**:
```bash
# 后端更新
cd /www/wwwroot/aibcbot.top
git pull origin main
cd backend
npm install
npm run build
pm2 restart bclogin-backend

# 前端更新
cd ../frontend
npm install
npm run build
sudo systemctl reload nginx
```

### 5. 皇冠平台相关

#### Q: 账号登录失败
**A**:
1. 检查账号密码是否正确
2. 检查代理配置是否正确
3. 检查皇冠站点是否可访问
4. 尝试使用备用站点

#### Q: 赛事数据抓取失败
**A**:
1. 检查抓取账号是否在线
2. 检查账号的 `use_for_fetch` 字段是否为 true
3. 检查网络连接
4. 查看后端日志

#### Q: 下注失败
**A**:
1. 检查账号余额是否充足
2. 检查赔率是否变化
3. 检查账号限额设置
4. 检查账号状态是否正常

### 6. 金币系统相关

#### Q: 金币扣除异常
**A**:
1. 检查 `coin_transactions` 表的流水记录
2. 检查用户余额是否正确
3. 查看后端日志中的金币操作记录

#### Q: 下注取消后金币未返还
**A**:
1. 检查下注状态是否为 `cancelled`
2. 检查 `coin_transactions` 表是否有返还记录
3. 手动执行结算同步：点击"结算"按钮

---

## 系统维护

### 日常维护任务

#### 1. 数据库备份
```bash
# 每天备份数据库
pg_dump -h 127.0.0.1 -U hgzuqiu hgzuqiu > backup_$(date +%Y%m%d).sql

# 压缩备份
gzip backup_$(date +%Y%m%d).sql
```

#### 2. 日志清理
```bash
# 清理 PM2 日志
pm2 flush

# 清理 Nginx 日志
sudo truncate -s 0 /var/log/nginx/access.log
sudo truncate -s 0 /var/log/nginx/error.log
```

#### 3. 监控服务状态
```bash
# 检查后端服务
pm2 status

# 检查 Nginx 服务
sudo systemctl status nginx

# 检查数据库服务
sudo systemctl status postgresql

# 检查磁盘空间
df -h

# 检查内存使用
free -h
```

#### 4. 性能优化
```bash
# 数据库性能分析
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -c "
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# 清理数据库
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -c "VACUUM ANALYZE;"
```

### 定期维护任务

#### 每周任务
1. 检查系统更新：`sudo apt update && sudo apt upgrade`
2. 检查磁盘空间
3. 检查数据库性能
4. 审查错误日志

#### 每月任务
1. 数据库完整备份
2. 清理旧的备份文件
3. 审查用户权限
4. 更新依赖包：`npm update`

---

## 安全建议

### 1. 密码安全
- 使用强密码（至少12位，包含大小写字母、数字、特殊字符）
- 定期更换密码
- 不要在代码中硬编码密码
- 使用环境变量存储敏感信息

### 2. 数据库安全
- 限制数据库访问IP
- 使用强密码
- 定期备份数据
- 启用 SSL 连接

### 3. API 安全
- 使用 HTTPS
- 实施速率限制
- 验证所有输入
- 使用 JWT Token 认证
- 设置合理的 Token 过期时间

### 4. 服务器安全
- 配置防火墙
- 禁用 root 登录
- 使用 SSH 密钥认证
- 定期更新系统
- 监控异常访问

---

## 联系方式

### 技术支持
- **项目地址**：https://github.com/latiaodream/hgzuqiu
- **线上地址**：https://aibcbot.top
- **服务器IP**：47.238.112.207

### 默认账号
- **管理员账号**：zhuren / 123456
- **数据库**：hgzuqiu / AbDN22pKhcsNnJSk

---

## 更新日志

### 2025-10-27
- ✅ 修复：添加 `score` 列到 `bets` 表，解决同步结算失败问题
- ✅ 优化：完成所有页面的移动端响应式优化
- ✅ 优化：赛事管理页面盘口显示优化（分两排显示）
- ✅ 修复：admin 用户查看下注记录权限问题

### 2025-10-26
- ✅ 新增：下注记录页面
- ✅ 新增：金币流水页面
- ✅ 新增：站点管理页面
- ✅ 优化：账号管理页面移动端显示

### 2025-10-25
- ✅ 新增：赛事管理页面
- ✅ 新增：自动下注功能
- ✅ 新增：结算同步功能

---

## 附录

### A. 皇冠备用站点列表
- hga026.com
- hga027.com
- hga030.com
- hga035.com
- hga038.com
- hga039.com
- hga050.com
- mos011.com
- mos022.com
- mos033.com
- mos055.com
- mos066.com
- mos100.com

### B. 常用命令速查

#### 服务器管理
```bash
# SSH 登录
ssh root@47.238.112.207

# 查看进程
pm2 list
pm2 monit

# 重启服务
pm2 restart bclogin-backend
sudo systemctl reload nginx

# 查看日志
pm2 logs bclogin-backend
sudo tail -f /var/log/nginx/error.log
```

#### 数据库管理
```bash
# 连接数据库
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu

# 备份数据库
pg_dump -h 127.0.0.1 -U hgzuqiu hgzuqiu > backup.sql

# 恢复数据库
psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu < backup.sql
```

#### Git 管理
```bash
# 拉取最新代码
git pull origin main

# 查看状态
git status

# 提交代码
git add .
git commit -m "feat: 新功能"
git push origin main
```

---

**文档版本**：v1.0
**最后更新**：2025-10-27
**维护者**：开发团队


