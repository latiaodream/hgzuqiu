# 邮箱验证码功能文档

## 功能概述

本系统实现了基于邮箱验证码的安全认证机制，包括：

1. **首次登录绑定邮箱**：新创建的账号首次登录时需要绑定邮箱
2. **非常用网络验证**：在非常用 IP 地址登录时需要邮箱验证码
3. **信任 IP 管理**：验证成功后自动将 IP 添加到信任列表

## 数据库变更

### 1. users 表新增字段

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS trusted_ips TEXT[];
```

### 2. 新增 verification_codes 表

```sql
CREATE TABLE verification_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(100) NOT NULL,
    code VARCHAR(6) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'email_binding', 'login_verification'
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. 新增 login_history 表

```sql
CREATE TABLE login_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    verification_required BOOLEAN DEFAULT FALSE
);
```

## 环境变量配置

在 `backend/.env` 文件中添加邮件服务配置：

```env
# 邮件服务配置
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password_or_app_password
```

### Gmail 配置示例

如果使用 Gmail，需要：

1. 开启两步验证
2. 生成应用专用密码：https://myaccount.google.com/apppasswords
3. 使用应用专用密码作为 `EMAIL_PASS`

### 其他邮件服务商

- **QQ 邮箱**：
  - HOST: `smtp.qq.com`
  - PORT: `587` 或 `465`
  - 需要开启 SMTP 服务并获取授权码

- **163 邮箱**：
  - HOST: `smtp.163.com`
  - PORT: `465`
  - 需要开启 SMTP 服务并获取授权码

- **Outlook**：
  - HOST: `smtp-mail.outlook.com`
  - PORT: `587`

## 安装依赖

```bash
cd backend
npm install nodemailer @types/nodemailer
```

## 数据库迁移

```bash
# 在服务器上执行
cd /www/wwwroot/aibcbot.top
psql -U postgres -d bclogin_system -f database/migrations/002_add_email_verification.sql
```

## API 接口

### 1. 登录接口（增强）

**POST** `/api/auth/login`

**请求体：**
```json
{
  "username": "test_user",
  "password": "password123",
  "verificationCode": "123456" // 可选，非常用网络登录时需要
}
```

**响应（需要绑定邮箱）：**
```json
{
  "success": false,
  "error": "请先绑定邮箱",
  "requireEmailBinding": true,
  "userId": 1,
  "email": "user@example.com"
}
```

**响应（需要验证码）：**
```json
{
  "success": false,
  "error": "检测到非常用网络登录，请输入邮箱验证码",
  "requireVerification": true,
  "userId": 1,
  "email": "user@example.com"
}
```

### 2. 发送验证码

**POST** `/api/auth/send-verification-code`

**请求体：**
```json
{
  "userId": 1,
  "email": "user@example.com",
  "type": "email_binding" // 或 "login_verification"
}
```

**响应：**
```json
{
  "success": true,
  "message": "验证码已发送",
  "code": "123456" // 仅开发环境返回
}
```

### 3. 绑定邮箱

**POST** `/api/auth/bind-email`

**请求体：**
```json
{
  "userId": 1,
  "email": "user@example.com",
  "verificationCode": "123456"
}
```

**响应：**
```json
{
  "success": true,
  "message": "邮箱绑定成功"
}
```

### 4. 获取登录历史

**GET** `/api/auth/login-history?limit=10`

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "login_time": "2025-11-04T08:00:00.000Z",
      "success": true,
      "verification_required": false
    }
  ]
}
```

## 使用流程

### 场景 1：首次登录（需要绑定邮箱）

1. 管理员创建代理账号（username: `agent1`, email: `agent1@example.com`）
2. 代理首次登录，输入用户名和密码
3. 系统检测到邮箱未验证，弹出"绑定邮箱"弹窗
4. 代理点击"发送验证码"，系统发送验证码到 `agent1@example.com`
5. 代理输入验证码，点击"确认绑定"
6. 绑定成功，当前 IP 自动添加到信任列表
7. 代理重新登录即可

### 场景 2：非常用网络登录（需要验证码）

1. 代理在新的网络环境（如家里）登录
2. 系统检测到 IP 不在信任列表中，弹出"安全验证"弹窗
3. 系统自动发送验证码到代理邮箱
4. 代理输入验证码，点击"验证并登录"
5. 验证成功，当前 IP 自动添加到信任列表
6. 登录成功

### 场景 3：常用网络登录（无需验证）

1. 代理在常用网络（如公司）登录
2. 系统检测到 IP 在信任列表中
3. 直接登录成功，无需验证码

## 前端组件

### EmailBindingModal

邮箱绑定弹窗组件，用于首次登录时绑定邮箱。

**Props：**
- `visible`: 是否显示
- `userId`: 用户 ID
- `defaultEmail`: 默认邮箱地址
- `onSuccess`: 绑定成功回调
- `onCancel`: 取消回调

### LoginVerificationModal

登录验证弹窗组件，用于非常用网络登录时验证。

**Props：**
- `visible`: 是否显示
- `userId`: 用户 ID
- `email`: 邮箱地址
- `username`: 用户名
- `password`: 密码
- `onSuccess`: 验证成功回调（返回验证码）
- `onCancel`: 取消回调

## 安全特性

1. **验证码有效期**：10 分钟
2. **验证码长度**：6 位数字
3. **一次性使用**：验证码使用后自动标记为已使用
4. **IP 信任列表**：验证成功后自动添加 IP 到信任列表
5. **登录历史记录**：记录所有登录尝试，包括 IP、User-Agent、成功/失败状态

## 定时任务

建议添加定时任务清理过期验证码：

```typescript
// 在 backend/src/app.ts 中添加
import { emailService } from './services/email.service';

// 每小时清理一次过期验证码
setInterval(() => {
  emailService.cleanupExpiredCodes();
}, 60 * 60 * 1000);
```

## 测试

### 开发环境测试

开发环境下，发送验证码接口会在响应中返回验证码，方便测试：

```json
{
  "success": true,
  "message": "验证码已发送",
  "code": "123456"
}
```

### 生产环境

生产环境下，验证码只会发送到邮箱，不会在响应中返回。

## 故障排查

### 1. 邮件发送失败

检查：
- 邮件服务配置是否正确
- 邮箱密码/授权码是否正确
- 网络是否可以访问邮件服务器
- 查看后端日志：`pm2 logs bclogin-backend --err`

### 2. 验证码无效

检查：
- 验证码是否过期（10 分钟）
- 验证码是否已使用
- 用户 ID 和邮箱是否匹配

### 3. IP 未添加到信任列表

检查：
- 验证是否成功
- 数据库 `users.trusted_ips` 字段是否更新
- 查看登录历史：`SELECT * FROM login_history WHERE user_id = ?`

## 未来改进

1. **验证码重试限制**：限制验证码发送频率（如 1 分钟内只能发送一次）
2. **IP 信任列表管理**：允许用户手动管理信任 IP 列表
3. **多因素认证**：支持 TOTP（Google Authenticator）
4. **邮件模板**：使用更美观的 HTML 邮件模板
5. **短信验证**：支持短信验证码作为备选方案

