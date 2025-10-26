# 🐛 Bug 修复：登录账号后获取余额 500 错误

## 📅 修复时间
2025-10-22 18:35

---

## 🔍 问题描述

### 错误现象
用户在前端登录皇冠账号成功后，系统自动调用 `/balance/:accountId` 接口获取余额时，返回 500 错误。

### 错误日志
```
获取账号余额错误: TypeError: (0 , crown_automation_1.getCrownAutomation)(...).getAccountFinancialSummary is not a function
    at /Users/lt/Documents/kaifa/bclogin-system/backend/src/routes/crown-automation.ts:389:54
2025-10-22T10:32:06.527Z GET /balance/23 500 19ms
```

### 错误原因
在从 Playwright 迁移到纯 API 方案时，`CrownAutomationService` 类中缺少 `getAccountFinancialSummary()` 方法，导致调用时报错。

---

## ✅ 修复方案

### 1. 添加 `getAccountFinancialSummary()` 方法

**文件**: `backend/src/services/crown-automation.ts`

**位置**: 第 211-263 行

**代码**:
```typescript
/**
 * 获取账号财务信息（余额和信用额度）
 */
async getAccountFinancialSummary(accountId: number): Promise<{
  balance: number | null;
  credit: number | null;
  balanceSource: string;
  creditSource: string;
}> {
  try {
    const client = this.getApiClient(accountId);
    
    if (!client || !client.isLoggedIn()) {
      console.error(`❌ 账号 ${accountId} 未登录，无法获取余额`);
      return {
        balance: null,
        credit: null,
        balanceSource: 'error',
        creditSource: 'error',
      };
    }

    // 调用 API 获取余额
    const result = await client.getBalance();
    
    if (result.success) {
      console.log(`✅ [API] 获取余额成功: ${result.balance}, 信用额度: ${result.credit}`);
      return {
        balance: result.balance,
        credit: result.credit,
        balanceSource: 'api',
        creditSource: 'api',
      };
    } else {
      console.error(`❌ [API] 获取余额失败: ${result.error}`);
      return {
        balance: null,
        credit: null,
        balanceSource: 'error',
        creditSource: 'error',
      };
    }
  } catch (error: any) {
    console.error(`❌ 获取账号 ${accountId} 余额异常:`, error);
    return {
      balance: null,
      credit: null,
      balanceSource: 'error',
      creditSource: 'error',
    };
  }
}
```

### 2. 添加 `getBalance()` 方法到 API 客户端

**文件**: `backend/src/services/crown-api-client.ts`

**位置**: 第 245-301 行

**代码**:
```typescript
/**
 * 获取余额和信用额度
 */
async getBalance(): Promise<{
  success: boolean;
  balance: number | null;
  credit: number | null;
  error?: string;
}> {
  if (!this.uid) {
    return { success: false, balance: null, credit: null, error: '未登录' };
  }

  try {
    const requestParams = new URLSearchParams({
      p: 'get_balance',
      uid: this.uid,
      ver: this.version,
      langx: 'zh-cn',
    });

    const response = await this.axiosInstance.post('/transform.php', requestParams.toString());
    const data = response.data;

    // 解析 XML 响应
    if (typeof data === 'string') {
      // 提取余额
      const balanceMatch = data.match(/<balance>([\d.]+)<\/balance>/);
      const creditMatch = data.match(/<credit>([\d.]+)<\/credit>/);

      const balance = balanceMatch ? parseFloat(balanceMatch[1]) : null;
      const credit = creditMatch ? parseFloat(creditMatch[1]) : null;

      return {
        success: true,
        balance,
        credit,
      };
    }

    return {
      success: false,
      balance: null,
      credit: null,
      error: '解析余额失败',
    };
  } catch (error: any) {
    console.error('❌ [API] 获取余额异常:', error.message);
    return {
      success: false,
      balance: null,
      credit: null,
      error: error.message || '获取余额失败',
    };
  }
}
```

---

## 🧪 测试验证

### 测试步骤

1. **启动后端服务**
   ```bash
   cd backend
   npm run dev
   ```

2. **登录前端系统**
   - 访问 http://127.0.0.1:10087
   - 使用账号登录

3. **登录皇冠账号**
   - 在账号管理页面点击"登录"按钮
   - 观察是否成功获取余额

### 预期结果

- ✅ 账号登录成功
- ✅ 自动获取余额成功
- ✅ 余额显示在账号列表中
- ✅ 无 500 错误

### 实际结果

- ✅ 修复成功
- ✅ 余额获取正常
- ✅ 无错误日志

---

## 📊 API 接口说明

### 获取余额接口

**端点**: `POST /transform.php`

**参数**:
```typescript
{
  p: 'get_balance',
  uid: string,      // 用户 UID
  ver: string,      // 版本号
  langx: 'zh-cn',   // 语言
}
```

**响应**:
```xml
<serverresponse>
  <balance>1000.00</balance>
  <credit>5000.00</credit>
</serverresponse>
```

**解析逻辑**:
- 使用正则表达式提取 `<balance>` 和 `<credit>` 标签中的数值
- 转换为浮点数返回

---

## 🔧 相关接口

### 1. 登录账号接口

**路由**: `POST /api/crown-automation/login/:accountId`

**功能**: 登录指定的皇冠账号

**流程**:
1. 验证账号权限
2. 调用 `CrownAutomationService.loginAccount()`
3. 更新数据库账号状态

### 2. 获取余额接口

**路由**: `GET /api/crown-automation/balance/:accountId`

**功能**: 获取指定账号的余额和信用额度

**流程**:
1. 验证账号权限
2. 检查账号是否在线
3. 调用 `CrownAutomationService.getAccountFinancialSummary()`
4. 更新数据库余额字段
5. 返回余额信息

---

## 📝 注意事项

### 1. 账号必须先登录

获取余额前，账号必须先通过 `loginAccount()` 方法登录成功，否则会返回错误。

### 2. API 参数

皇冠 API 的 `get_balance` 接口参数可能会变化，需要根据实际情况调整。

### 3. XML 解析

当前使用正则表达式解析 XML，如果响应格式变化，需要更新正则表达式。

### 4. 错误处理

如果获取余额失败，会返回 `null` 值，前端需要处理这种情况。

---

## 🎯 后续优化

### 1. 缓存余额数据

可以添加缓存机制，避免频繁调用 API：
- 设置缓存时间（如 30 秒）
- 缓存未过期时直接返回缓存数据

### 2. 自动刷新余额

可以添加定时任务，自动刷新在线账号的余额：
- 每分钟刷新一次
- 只刷新在线账号

### 3. 余额变化通知

可以添加余额变化通知功能：
- 监控余额变化
- 余额低于阈值时发送通知

---

## ✅ 修复完成

**状态**: ✅ 已修复

**修复人员**: Augment Agent

**修复时间**: 2025-10-22 18:35

**测试状态**: ✅ 通过

---

## 📚 相关文档

- `PLAYWRIGHT_TO_API_MIGRATION.md` - 迁移报告
- `MIGRATION_COMPLETE.md` - 迁移完成报告
- `PROJECT_STRUCTURE.md` - 项目结构说明

