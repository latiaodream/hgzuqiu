# 测试下注参数传递

## 问题描述

用户报告：下注让球时，实际在皇冠官网下注的是独赢。

## 排查步骤

### 1. 检查前端传递的参数

在浏览器开发者工具中，查看下注请求的 payload：

```
POST /api/bets
```

**让球下注应该包含**：
```json
{
  "bet_type": "让球",
  "bet_option": "主队 (+0.5)",
  "market_category": "handicap",
  "market_scope": "full",
  "market_side": "home",
  "market_wtype": "RE",
  "market_rtype": "REH",
  "market_chose_team": "H"
}
```

**独赢下注应该包含**：
```json
{
  "bet_type": "独赢",
  "bet_option": "主队",
  "market_category": "moneyline",
  "market_scope": "full",
  "market_side": "home",
  "market_wtype": "RM",
  "market_rtype": "RMH",
  "market_chose_team": "H"
}
```

### 2. 检查后端日志

在服务器上查看日志：

```bash
pm2 logs bclogin-backend --lines 200 | grep -A 10 "下注参数"
```

应该看到：

```
🔄 转换下注参数: betType="让球", betOption="主队 (+0.5)"
🔍 下注参数覆盖值: {
  market_wtype: 'RE',
  market_rtype: 'REH',
  market_chose_team: 'H',
  base_wtype: 'RE',
  base_rtype: 'REH',
  base_chose_team: 'H'
}
✅ 最终使用的参数: { wtype: 'RE', rtype: 'REH', chose_team: 'H' }
```

### 3. 检查皇冠 API 请求

查看实际发送给皇冠的请求参数：

```bash
pm2 logs bclogin-backend --lines 200 | grep "FT_order_view\|FT_bet"
```

应该看到：

```
📤 FT_order_view 请求参数: {
  gid: '8276371',
  wtype: 'RE',
  chose_team: 'H'
}

📤 FT_bet 请求参数: {
  gid: '8276371',
  wtype: 'RE',
  rtype: 'REH',
  chose_team: 'H'
}
```

## 可能的问题

### 问题 1：前端没有传递 market_wtype/market_rtype

**症状**：
- 后端日志显示 `market_wtype: undefined`
- 最终使用的参数是 `wtype: 'RM'`（独赢）

**原因**：
- 前端点击的盘口数据中没有 `wtype`、`home_rtype`、`away_rtype` 字段
- 后端无法获取正确的玩法类型，默认使用独赢

**解决方案**：
- 检查后端返回的赛事数据中是否包含这些字段
- 检查 `parseMarketsFromEvent()` 函数是否正确设置了这些字段

### 问题 2：前端传递了错误的 market_category

**症状**：
- 后端日志显示 `market_category: 'moneyline'`（应该是 'handicap'）
- 最终使用的参数是 `wtype: 'RM'`（独赢）

**原因**：
- 前端在构建下注参数时，错误地设置了 `market_category`

**解决方案**：
- 检查 `MatchesPage.tsx` 中 `renderHandicapV2()` 函数
- 确保 `market_category: 'handicap'` 正确传递

### 问题 3：后端解析逻辑错误

**症状**：
- 前端传递的参数正确
- 但后端最终使用的参数是 `wtype: 'RM'`（独赢）

**原因**：
- `convertBetTypeToApiParams()` 函数解析逻辑有问题
- 或者 `buildBetVariants()` 函数生成了错误的变体

**解决方案**：
- 检查 `convertBetTypeToApiParams()` 函数的逻辑
- 检查 `buildBetVariants()` 函数的 fallback 映射

## 测试用例

### 测试 1：让球主队

**前端点击**：让球盘口的主队赔率（例如：主队 +0.5 @ 1.85）

**预期参数**：
```json
{
  "bet_type": "让球",
  "bet_option": "主队 (+0.5)",
  "market_category": "handicap",
  "market_wtype": "RE",
  "market_rtype": "REH",
  "market_chose_team": "H"
}
```

**预期皇冠请求**：
```
wtype=RE&rtype=REH&chose_team=H
```

### 测试 2：让球客队

**前端点击**：让球盘口的客队赔率（例如：客队 -0.5 @ 2.05）

**预期参数**：
```json
{
  "bet_type": "让球",
  "bet_option": "客队 (-0.5)",
  "market_category": "handicap",
  "market_wtype": "RE",
  "market_rtype": "REC",
  "market_chose_team": "C"
}
```

**预期皇冠请求**：
```
wtype=RE&rtype=REC&chose_team=C
```

### 测试 3：独赢主队

**前端点击**：独赢盘口的主队赔率（例如：主队 @ 2.10）

**预期参数**：
```json
{
  "bet_type": "独赢",
  "bet_option": "主队",
  "market_category": "moneyline",
  "market_wtype": "RM",
  "market_rtype": "RMH",
  "market_chose_team": "H"
}
```

**预期皇冠请求**：
```
wtype=RM&rtype=RMH&chose_team=H
```

### 测试 4：大小球 - 大

**前端点击**：大小球盘口的大球赔率（例如：大 2.5 @ 1.90）

**预期参数**：
```json
{
  "bet_type": "大小球",
  "bet_option": "大球(2.5)",
  "market_category": "overunder",
  "market_wtype": "ROU",
  "market_rtype": "ROUC",
  "market_chose_team": "C"
}
```

**预期皇冠请求**：
```
wtype=ROU&rtype=ROUC&chose_team=C
```

## 调试命令

### 查看实时日志

```bash
# 查看所有日志
pm2 logs bclogin-backend --lines 50

# 只看下注相关日志
pm2 logs bclogin-backend --lines 200 | grep -E "下注|bet|wtype|rtype"

# 只看错误日志
pm2 logs bclogin-backend --err --lines 50
```

### 查看网络请求

在浏览器开发者工具中：
1. 打开 Network 标签
2. 筛选 XHR 请求
3. 点击下注按钮
4. 查看 `/api/bets` 请求的 Payload 和 Response

### 查看数据库记录

```bash
# 连接数据库
psql -U postgres -d bclogin

# 查看最近的下注记录
SELECT id, bet_type, bet_option, market_category, market_wtype, market_rtype, market_chose_team, status, created_at
FROM bets
ORDER BY created_at DESC
LIMIT 10;
```

## 修复记录

### 2025-01-XX - 添加调试日志

- 在 `convertBetTypeToApiParams()` 函数中添加日志
- 记录 `market_wtype`、`market_rtype`、`market_chose_team` 的覆盖值
- 记录最终使用的参数

### 2025-01-XX - 修复 parseMoreMarketsFromXml 错误

- 修复 `JSON.stringify().substring()` 可能返回 undefined 的问题
- 添加安全检查，避免调用 undefined 的 substring 方法

