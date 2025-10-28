# 账号限额自动获取功能

## 功能概述

该功能允许用户在编辑账号时，自动从皇冠网站获取该账号的实际限额信息，并自动填充到表单中。

## 使用方法

### 自动获取（推荐）

**新增账号时自动获取**：
1. 打开账号管理页面
2. 点击"添加账号"按钮
3. 填写账号信息（包括用户名和密码）
4. 点击"确定"保存账号
5. 系统会自动创建账号，并在后台获取限额信息
6. 获取成功后会显示提示消息

### 手动获取

**编辑已有账号时手动获取**：
1. 打开账号管理页面
2. 点击编辑某个已存在的账号
3. 切换到"限额设置"标签页
4. 点击页面顶部的"获取限额"按钮
5. 系统会自动登录皇冠网站，获取限额信息并填充到表单中

### 注意事项

- **新增账号会自动获取限额**：保存账号后系统会自动在后台获取
- **手动获取适用于更新限额**：当限额发生变化时，可以手动重新获取
- 获取限额需要使用账号的用户名和密码登录皇冠网站
- 获取过程可能需要几秒钟，请耐心等待
- 如果自动获取失败，可以稍后手动获取或直接输入限额值

## 技术实现

### 后端 API

**接口地址**: `POST /api/crown-automation/fetch-limits/:accountId`

**功能**: 登录皇冠网站，访问限额设置页面，解析并返回限额数据

**返回数据格式**:
```json
{
  "success": true,
  "message": "限额信息获取成功",
  "data": {
    "football": {
      "prematch": 200000,
      "live": 200000
    },
    "basketball": {
      "prematch": 200000,
      "live": 200000
    }
  }
}
```

### 核心代码

#### 1. 后端路由 (`backend/src/routes/crown-automation.ts`)

```typescript
router.post('/fetch-limits/:accountId', async (req: any, res) => {
    // 验证账号权限
    // 调用 getCrownAutomation().fetchAccountLimits(account)
    // 更新数据库中的限额信息
    // 返回限额数据
});
```

#### 2. 自动化服务 (`backend/src/services/crown-automation.ts`)

```typescript
async fetchAccountLimits(account: CrownAccount): Promise<{
    success: boolean;
    limits?: {
      football: { prematch: number; live: number };
      basketball: { prematch: number; live: number };
    };
}> {
    // 使用 CrownApiClient 登录
    // 获取限额页面 HTML
    // 解析 HTML 提取限额数据
    // 返回结构化的限额信息
}
```

#### 3. HTML 解析逻辑

系统会从皇冠网站的"详细设定"页面提取以下信息：

- **足球赛前限额**: 从"让球, 大小, 单双"行的"单注最高"列提取
- **足球滚球限额**: 从"滚球让球, 滚球大小, 滚球单双"行的"单注最高"列提取
- **篮球赛前限额**: 从篮球表格的"让球, 大小, 单双"行的"单注最高"列提取
- **篮球滚球限额**: 从篮球表格的"滚球让球, 滚球大小, 滚球单双"行的"单注最高"列提取

#### 4. 前端组件 (`frontend/src/components/Accounts/AccountFormModal.tsx`)

```typescript
const handleFetchLimits = async () => {
    // 验证账号和密码已填写
    // 调用 accountApi.fetchLimits(accountId)
    // 将返回的限额数据填充到表单
};
```

#### 5. API 服务 (`frontend/src/services/api.ts`)

```typescript
export const accountApi = {
  fetchLimits: (accountId: number): Promise<ApiResponse<{
    football: { prematch: number; live: number };
    basketball: { prematch: number; live: number };
  }>> =>
    apiClient.post(`/crown-automation/fetch-limits/${accountId}`).then(res => res.data),
};
```

## 数据流程

### 自动获取流程（新增账号）

```
用户填写账号信息并点击"确定"
    ↓
前端调用 accountApi.createAccount(data)
    ↓
后端创建账号并返回账号ID
    ↓
前端自动调用 accountApi.fetchLimits(accountId)
    ↓
后端接收请求，验证账号权限
    ↓
使用 CrownApiClient 登录皇冠网站
    ↓
访问限额设置页面 (account_wager_limit.php)
    ↓
解析 HTML 提取限额数据
    ↓
更新数据库中的限额字段
    ↓
返回限额数据给前端
    ↓
前端显示成功消息
```

### 手动获取流程（编辑账号）

```
用户点击"获取限额"按钮
    ↓
前端调用 accountApi.fetchLimits(accountId)
    ↓
后端接收请求，验证账号权限
    ↓
使用 CrownApiClient 登录皇冠网站
    ↓
访问限额设置页面 (account_wager_limit.php)
    ↓
解析 HTML 提取限额数据
    ↓
更新数据库中的限额字段
    ↓
返回限额数据给前端
    ↓
前端自动填充表单字段
```

## 错误处理

### 常见错误及解决方案

1. **"请先保存账号后再获取限额信息"**
   - 原因: 新增账号尚未保存
   - 解决: 先保存账号，然后再编辑并获取限额

2. **"登录失败"**
   - 原因: 账号或密码错误
   - 解决: 检查账号信息是否正确

3. **"获取限额页面失败"**
   - 原因: 网络问题或皇冠网站不可访问
   - 解决: 检查网络连接，或稍后重试

4. **"无法从页面中解析限额数据"**
   - 原因: 皇冠网站页面结构发生变化
   - 解决: 需要更新解析逻辑

## 数据库字段

限额信息存储在 `crown_accounts` 表中：

- `football_prematch_limit`: 足球赛前限额
- `football_live_limit`: 足球滚球限额
- `basketball_prematch_limit`: 篮球赛前限额
- `basketball_live_limit`: 篮球滚球限额

## 安全性

- 所有请求都需要通过 JWT 认证
- 只能获取属于当前用户的账号限额
- 使用 HTTPS 加密传输
- 不会在日志中记录敏感信息（密码等）

## 已实现的功能

✅ 新增账号时自动获取限额
✅ 编辑账号时手动获取限额
✅ 自动更新数据库中的限额信息
✅ 友好的错误提示和加载状态

## 未来改进

1. 添加限额变化监控和通知
2. 支持批量获取多个账号的限额
3. 缓存限额信息，减少重复请求
4. 定期自动更新限额（后台任务）

