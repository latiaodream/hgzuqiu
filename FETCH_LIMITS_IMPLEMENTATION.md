# 账号限额自动获取功能 - 实现总结

## 功能说明

实现了从皇冠网站自动获取账号限额信息的功能，用户在编辑账号时可以一键获取该账号在皇冠网站的实际限额设置。

## 修改的文件

### 后端文件

1. **backend/src/routes/crown-automation.ts**
   - 新增 API 接口: `POST /api/crown-automation/fetch-limits/:accountId`
   - 功能: 接收账号ID，调用自动化服务获取限额，更新数据库

2. **backend/src/services/crown-automation.ts**
   - 新增方法: `fetchAccountLimits(account: CrownAccount)`
   - 功能: 使用 API 客户端登录皇冠，获取并解析限额页面
   - 新增方法: `parseLimitsFromHtml(html: string)`
   - 功能: 从 HTML 中提取足球和篮球的赛前/滚球限额

3. **backend/src/services/crown-api-client.ts**
   - 新增方法: `getBaseUrl()`
   - 功能: 返回当前使用的皇冠网站基础 URL
   - 新增方法: `fetch(url: string, options: any)`
   - 功能: 通用的 HTTP 请求方法，用于获取 HTML 页面

### 前端文件

4. **frontend/src/components/Accounts/AccountFormModal.tsx**
   - 新增状态: `fetchingLimits` - 跟踪获取限额的加载状态
   - 新增方法: `handleFetchLimits()` - 处理获取限额的逻辑
   - UI 改进: 在限额设置标签页添加了说明和"获取限额"按钮

5. **frontend/src/services/api.ts**
   - 新增 API 方法: `accountApi.fetchLimits(accountId: number)`
   - 功能: 调用后端接口获取限额信息

### 文档文件

6. **docs/fetch-limits-feature.md**
   - 详细的功能文档，包括使用方法、技术实现、数据流程等

7. **FETCH_LIMITS_IMPLEMENTATION.md** (本文件)
   - 实现总结和快速参考

## 使用流程

### 自动获取（新增账号）

1. 进入账号管理页面
2. 点击"添加账号"按钮
3. 填写账号信息（用户名、密码等）
4. 点击"确定"保存
5. 系统自动创建账号并在后台获取限额
6. 显示成功消息

### 手动获取（编辑账号）

1. 进入账号管理页面
2. 点击编辑某个已存在的账号
3. 切换到"限额设置"标签页
4. 点击"获取限额"按钮
5. 等待几秒钟，系统自动填充限额信息

### 系统处理流程

**自动获取流程（新增账号）**：
```
前端: 用户填写账号信息并点击"确定"
  ↓
前端: 调用 accountApi.createAccount(data)
  ↓
后端: 创建账号并返回账号ID
  ↓
前端: 自动调用 accountApi.fetchLimits(accountId)
  ↓
后端: 接收请求，验证用户权限
  ↓
后端: 调用 getCrownAutomation().fetchAccountLimits(account)
  ↓
后端: 使用 CrownApiClient 登录皇冠网站
  ↓
后端: 访问 /app/member/account/account_wager_limit.php
  ↓
后端: 解析 HTML，提取限额数据
  ↓
后端: 更新数据库中的限额字段
  ↓
后端: 返回限额数据
  ↓
前端: 显示成功消息
```

**手动获取流程（编辑账号）**：
```
前端: 用户点击"获取限额"按钮
  ↓
前端: 调用 accountApi.fetchLimits(accountId)
  ↓
后端: 接收请求，验证用户权限
  ↓
后端: 调用 getCrownAutomation().fetchAccountLimits(account)
  ↓
后端: 使用 CrownApiClient 登录皇冠网站
  ↓
后端: 访问 /app/member/account/account_wager_limit.php
  ↓
后端: 解析 HTML，提取限额数据
  ↓
后端: 更新数据库中的限额字段
  ↓
后端: 返回限额数据
  ↓
前端: 自动填充表单字段
  ↓
前端: 显示成功消息
```

## 获取的限额数据

从皇冠网站的"详细设定"页面获取以下限额：

### 足球限额
- **赛前限额** (football_prematch_limit): 让球、大小、单双的单注最高
- **滚球限额** (football_live_limit): 滚球让球、滚球大小、滚球单双的单注最高

### 篮球限额
- **赛前限额** (basketball_prematch_limit): 让球、大小、单双的单注最高
- **滚球限额** (basketball_live_limit): 滚球让球、滚球大小、滚球单双的单注最高

## 示例数据

从皇冠网站获取的典型限额数据：

```json
{
  "football": {
    "prematch": 200000,
    "live": 200000
  },
  "basketball": {
    "prematch": 200000,
    "live": 200000
  }
}
```

## 限制和注意事项

1. **自动获取**: 新增账号时会自动在后台获取限额，无需手动操作
2. **需要正确的账号密码**: 系统会使用账号的用户名和密码登录皇冠网站
3. **网络依赖**: 需要能够访问皇冠网站
4. **页面结构依赖**: 如果皇冠网站的页面结构发生变化，可能需要更新解析逻辑
5. **失败处理**: 如果自动获取失败，会显示警告消息，用户可以稍后手动获取

## 错误处理

系统会处理以下错误情况：

- 账号不存在或无权限
- 登录失败（账号密码错误）
- 网络请求失败
- HTML 解析失败
- 数据库更新失败

所有错误都会通过友好的消息提示给用户。

## 测试建议

### 手动测试步骤

1. **自动获取测试（新增账号）**
   - 创建一个新账号并保存
   - 观察是否显示"正在自动获取限额信息..."的消息
   - 验证是否显示"限额信息已自动获取并保存"的成功消息
   - 编辑该账号，查看限额字段是否已填充

2. **手动获取测试（编辑账号）**
   - 编辑一个已存在的账号
   - 切换到限额设置标签
   - 点击"获取限额"按钮
   - 验证限额数据是否正确填充到表单

3. **错误处理测试**
   - 测试使用错误的账号密码（应显示登录失败警告）
   - 测试网络断开情况（应显示网络错误警告）
   - 验证错误时账号仍然创建成功，只是限额获取失败

4. **权限测试**
   - 测试不同角色用户是否只能获取自己的账号限额

## 性能考虑

- 获取限额需要登录皇冠网站，通常需要 3-5 秒
- 使用了 loading 状态和消息提示，提供良好的用户体验
- 获取后的限额会保存到数据库，避免重复获取

## 安全性

- 所有 API 请求都需要 JWT 认证
- 验证用户只能访问自己的账号
- 不在日志中记录敏感信息
- 使用 HTTPS 加密传输

## 已实现的功能

✅ **新增账号时自动获取限额**: 保存账号后自动在后台获取
✅ **编辑账号时手动获取限额**: 通过按钮手动触发获取
✅ **自动更新数据库**: 获取后自动保存到数据库
✅ **友好的用户提示**: 加载状态和成功/失败消息
✅ **错误处理**: 获取失败不影响账号创建

## 未来改进方向

1. **批量获取**: 支持一次性获取多个账号的限额
2. **定时更新**: 定期自动更新账号限额（后台任务）
3. **限额变化通知**: 当限额发生变化时通知用户
4. **缓存机制**: 缓存限额信息，减少重复请求
5. **重试机制**: 获取失败时自动重试

## 相关文件位置

```
backend/
  src/
    routes/
      crown-automation.ts          # API 路由
    services/
      crown-automation.ts          # 自动化服务
      crown-api-client.ts          # API 客户端

frontend/
  src/
    components/
      Accounts/
        AccountFormModal.tsx       # 账号表单组件
    services/
      api.ts                       # API 服务

docs/
  fetch-limits-feature.md          # 详细文档
```

## 总结

该功能成功实现了从皇冠网站自动获取账号限额的需求：

✅ **自动化**: 新增账号时自动获取限额，无需手动操作
✅ **灵活性**: 支持手动重新获取限额
✅ **用户体验**: 友好的加载状态和提示消息
✅ **错误处理**: 获取失败不影响账号创建
✅ **代码质量**: 结构清晰，易于维护和扩展

用户现在可以更方便地管理账号限额，系统会自动从皇冠网站获取最新的限额信息。

