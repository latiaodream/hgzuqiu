# 项目笔记

## 总体定位
- 皇冠足球下注平台，包含账号初始化、批量下注、赛事抓取、金币流水与角色层级管理能力。

## 技术栈
- 前端：React 18、Vite、Ant Design。
- 后端：Express 5、TypeScript。
- 持久化：PostgreSQL。
- 自动化：Playwright 驱动皇冠站点操作。

## 项目结构
- `frontend/`：路由布局、上下文、API 封装。
- `backend/`：路由、中间件、服务逻辑。
- `database/`：`schema` 定义。
- `docs/`：业务规则与自动化文档。

## 后端亮点
- `app.ts` 挂载 `auth`、`agents`、`staff`、`accounts`、`groups`、`matches`、`bets`、`coins`、`crown-automation` 等路由。
- 中间件：`middleware/auth` 校验 JWT；`middleware/permission` 处理角色、层级与资源权限。
- `accounts` 路由实现账号优选逻辑；`bets` 负责下注、统计与自动化下单；`crown-automation` 调用 Playwright 完成登录、改密、下注。
- `services/account-selection` 支持止盈、线路互斥与盈亏排序；`services/crown-automation` 管理浏览器实例，支持通过 `CROWN_BASE_URLS` 配置多域名回退，并结合 `CROWN_BASE_URL_FAIL_COOLDOWN_MS`/`CROWN_BASE_URL_FAIL_THRESHOLD` 做域名健康退避，提升初始化稳定性。
- 数据库工具脚本：`migrate.js`、`ensure-admin.js`。

## 前端亮点
- `AuthContext` 管理 Token 与角色；`ProtectedRoute` 保护业务路由。
- `services/api` 统一 axios 封装，覆盖全部后端接口。
- 页面：`Dashboard`（统计）、`Accounts`（账号 CRUD 与初始化）、`Betting`（注单）、`Matches`（实时赛事抓取）、`Coins`（流水）、`Agents/Staff`（角色管理）、`FetchAccounts`（抓取账号配置）、`Settings`（个人中心）。
- `utils/credentials` 生成符合皇冠规范的账号密码。

## 数据库
- `schema.sql` 定义 `users`（层级）、`groups`、`crown_accounts`（代理、限额、抓取）、`matches`、`bets`、`coin_transactions`、`settings` 等表及索引。

## 自动化文档
- `IMPLEMENTATION_SUMMARY.md`、`CROWN_INIT_OPTIMIZATION.md` 记录改密流程调试。
- `docs/account_selection_rules.md` 定义账号优选规则。
