# 皇冠平台余额获取说明

## 📅 更新时间
2025-10-22 19:00 - ✅ 已实现 HTML 解析获取余额

---

## 🔍 问题分析

### 问题描述
用户在前端登录皇冠账号后，系统调用 `/balance/:accountId` 接口获取余额时失败。

### 调查过程

#### 1. 尝试的 API 接口

我们尝试了以下接口参数：

| 接口参数 | 结果 | 说明 |
|---------|------|------|
| `p=get_balance` | 404 错误 | 接口不存在 |
| `p=get_member_data` | 404 错误 | 接口不存在 |
| `p=chk_login` | 只返回 `VariableStandard` | 登录成功标识，无余额信息 |

#### 2. 浏览器实际情况

通过 MCP 浏览器登录皇冠平台后，发现：

1. **页面显示**：
   ```
   elrukeblnl8
   RMB
   1,000.00
   ```

2. **JavaScript 变量**：
   ```javascript
   window.maxcredit = "1,000.00"
   top.maxcredit = "1,000.00"
   ```

3. **数据来源**：
   余额信息存储在页面 HTML 中的 JavaScript 代码里：
   ```javascript
   _CHDomain.maxcredit = '1,000.00';
   _CHDomain.username = 'elrukeblnl8';
   _CHDomain.mid = '39199455';
   _CHDomain.uid = 'j4uudr1wjm39199455l143116b0';
   ```

#### 3. 结论

**皇冠平台的余额信息不是通过单独的 API 接口获取的**，而是在登录成功后，主页 HTML 中通过 JavaScript 变量直接返回的。

---

## 💡 解决方案

### ✅ 当前实现（已完成）

我们实现了通过解析主页 HTML 获取余额的功能：

#### 1. 解析主页 HTML
- 访问主页 `/` 获取 HTML
- 提取 `_CHDomain.maxcredit` 变量
- 解析余额数值（移除千位分隔符）

#### 2. 缓存机制
- 缓存时间：30 秒
- 避免频繁请求主页
- 下注后自动清除缓存

#### 3. 降级策略
- 如果解析失败，返回 `null`
- 不影响其他功能正常使用

#### 4. 代码实现

**`backend/src/services/crown-api-client.ts`**:
```typescript
async getBalance(forceRefresh: boolean = false): Promise<{
  success: boolean;
  balance: number | null;
  credit: number | null;
  error?: string;
}> {
  if (!this.uid) {
    return { success: false, balance: null, credit: null, error: '未登录' };
  }

  // 检查缓存（30秒内）
  const now = Date.now();
  if (!forceRefresh && this.balanceCache &&
      (now - this.balanceCache.timestamp) < this.balanceCacheDuration) {
    console.log(`📦 [API] 使用缓存的余额: ${this.balanceCache.balance}`);
    return {
      success: true,
      balance: this.balanceCache.balance,
      credit: this.balanceCache.credit,
    };
  }

  // 访问主页获取 HTML
  const response = await this.axiosInstance.get('/');
  const html = response.data;

  // 提取 _CHDomain.maxcredit
  const maxcreditMatch = html.match(/_CHDomain\.maxcredit\s*=\s*'([^']+)'/);

  let balance: number | null = null;
  if (maxcreditMatch && maxcreditMatch[1]) {
    const balanceStr = maxcreditMatch[1].replace(/,/g, '');
    balance = parseFloat(balanceStr);
    console.log(`✅ [API] 获取余额成功: ${balance}`);
  }

  // 更新缓存
  this.balanceCache = { balance, credit: null, timestamp: now };

  return { success: true, balance, credit: null };
}

// 清除缓存（下注后调用）
clearBalanceCache(): void {
  this.balanceCache = null;
}
```

**`backend/src/services/crown-automation.ts`**:
```typescript
async getAccountFinancialSummary(accountId: number): Promise<{
  balance: number | null;
  credit: number | null;
  balanceSource: string;
  creditSource: string;
}> {
  const client = this.getApiClient(accountId);

  if (!client || !client.isLoggedIn()) {
    return {
      balance: null,
      credit: null,
      balanceSource: 'not_logged_in',
      creditSource: 'not_logged_in',
    };
  }

  // 调用 API 获取余额（解析主页 HTML）
  const result = await client.getBalance();

  if (result.success && result.balance !== null) {
    console.log(`✅ [API] 账号 ${accountId} 余额: ${result.balance}`);
    return {
      balance: result.balance,
      credit: result.credit,
      balanceSource: 'html_parse',
      creditSource: result.credit !== null ? 'html_parse' : 'unavailable',
    };
  } else {
    return {
      balance: null,
      credit: null,
      balanceSource: 'error',
      creditSource: 'error',
    };
  }
}
```

---

## 🚀 未来改进方案

如果需要实时获取余额，可以考虑以下方案：

### 方案 1：解析主页 HTML

**优点**：
- 可以获取实时余额
- 不需要额外的 API 调用

**缺点**：
- 需要解析 HTML 和 JavaScript
- 页面结构变化时需要更新解析逻辑
- 性能开销较大

**实现思路**：
```typescript
async getBalance(): Promise<{ balance: number | null; credit: number | null }> {
  // 1. 使用登录后的 Cookie 访问主页
  const response = await this.axiosInstance.get('/');
  const html = response.data;
  
  // 2. 提取 _CHDomain.maxcredit
  const match = html.match(/_CHDomain\.maxcredit\s*=\s*'([^']+)'/);
  if (match) {
    const balanceStr = match[1].replace(/,/g, ''); // 移除千位分隔符
    const balance = parseFloat(balanceStr);
    return { balance, credit: null };
  }
  
  return { balance: null, credit: null };
}
```

### 方案 2：从下注响应中更新

**优点**：
- 无需额外请求
- 余额信息准确（下注后的最新余额）

**缺点**：
- 只有在下注后才能获取余额
- 首次登录时无法显示余额

**实现思路**：
```typescript
// 在下注成功后
const betResponse = await this.placeBet(...);
if (betResponse.success) {
  // 提取余额信息
  const nowcredit = betResponse.data.nowcredit; // 当前余额
  const gold = betResponse.data.gold; // 下注金额
  
  // 更新数据库
  await updateAccountBalance(accountId, nowcredit);
}
```

### 方案 3：使用浏览器自动化

**优点**：
- 可以获取所有页面信息
- 最接近真实用户操作

**缺点**：
- 资源消耗大
- 速度慢
- 已经从 Playwright 迁移到纯 API

**不推荐**：我们已经完成了从 Playwright 到纯 API 的迁移，不应该再回到浏览器自动化方案。

---

## 📊 实现方案

### ✅ 已实现：解析主页 HTML
- ✅ 访问主页获取 HTML
- ✅ 提取 `_CHDomain.maxcredit` 变量
- ✅ 解析余额数值
- ✅ 30秒缓存机制
- ✅ 下注后自动清除缓存

### 🎯 功能特点
1. **实时余额**：每次调用都能获取最新余额（缓存30秒）
2. **性能优化**：缓存机制避免频繁请求
3. **容错处理**：解析失败返回 `null`，不影响其他功能
4. **自动更新**：下注后清除缓存，下次获取最新余额

---

## 🔧 前端适配

前端现在可以正常显示余额了：

```typescript
// 余额通常不为 null，但仍需处理异常情况
if (account.balance === null) {
  return <span>余额获取中...</span>;
} else {
  return <span>¥{account.balance.toFixed(2)}</span>;
}
```

### 刷新余额

如果需要手动刷新余额，可以调用：

```typescript
// 前端调用
await axios.get(`/api/crown-automation/balance/${accountId}`);
```

后端会自动使用缓存（30秒内）或重新获取。

---

## 📝 相关文档

- `BUGFIX_BALANCE_API.md` - Bug 修复记录
- `PLAYWRIGHT_TO_API_MIGRATION.md` - Playwright 迁移报告
- `docs/crown-api-requests.md` - 皇冠 API 文档

---

## ✅ 总结

1. **问题原因**：皇冠平台没有单独的余额查询 API
2. **✅ 解决方案**：解析主页 HTML 获取 `_CHDomain.maxcredit`
3. **✅ 性能优化**：30秒缓存机制
4. **✅ 用户体验**：前端可以正常显示实时余额

### 测试步骤

1. 刷新前端页面
2. 登录皇冠账号
3. 查看余额是否正常显示
4. 30秒内再次查看，应该使用缓存（速度更快）

---

**更新人员**: Augment Agent
**更新时间**: 2025-10-22 19:00
**状态**: ✅ 已完成 HTML 解析实现

