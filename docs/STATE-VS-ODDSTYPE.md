# 比赛状态 (state) vs 赔率类型 (oddsType)

## 📋 概述

根据 [iSportsAPI 官方文档](https://www.isportsapi.com/docs.html?id=24&lang=en)，需要区分两个不同的概念：

### 1. 比赛状态 (state/status)

来自 **Schedule API** (`/sport/football/schedule/basic`)

| 值 | 含义 | 说明 |
|---|---|---|
| `0` | 未开赛 | 比赛还未开始 |
| `1` | 进行中 | 比赛正在进行（滚球） |
| `-1` 或 `3` | 已结束 | 比赛已经结束 |
| `2` | 中场休息 | 半场休息或其他中间状态 |

### 2. 赔率类型 (oddsType)

来自 **Odds API** (`/sport/football/odds/main`)

| 值 | 含义 | 说明 |
|---|---|---|
| `0` | 无法判断 | Unable to judge |
| `1` | 早期赔率 | Early Odds |
| `2` | 即时赔率 | Instant odds (after the early odds before the match) |
| `3` | 滚球赔率 | Inplay odds |

## 🔑 关键区别

- **`state`** 表示**比赛的实际状态**（是否在进行）
- **`oddsType`** 表示**赔率的类型**（早期/即时/滚球）

### 示例场景

| state | oddsType | 说明 |
|---|---|---|
| `0` | `1` | 未开赛，早期赔率 |
| `0` | `2` | 未开赛，即时赔率（比赛临近） |
| `1` | `3` | 进行中，滚球赔率 ✅ |
| `-1` | `2` | 已结束，最后的即时赔率 |

## ✅ 正确的判断逻辑

### 判断是否为滚球比赛

```typescript
// ✅ 正确：只看 state
const isLive = match.state === 1;

// ❌ 错误：不要用 oddsType 判断
const isLive = match.oddsType === 3; // 错误！
```

### 判断使用哪种赔率

```typescript
// 从赔率数据中获取 oddsType
const handicap = odds.handicap.find(h => h.companyId === '3'); // 皇冠
const oddsType = handicap.oddsType;

if (oddsType === 1) {
  console.log('使用早期赔率');
} else if (oddsType === 2) {
  console.log('使用即时赔率');
} else if (oddsType === 3) {
  console.log('使用滚球赔率');
}
```

## 🐛 之前的问题

### 问题 1：错误地将所有有 period/clock 字段的比赛判断为滚球

**错误代码**：
```typescript
if (match.state === 1 || match.state === '1' || match.period || match.clock) {
  showtype = 'live';
}
```

**问题**：
- 所有比赛都有 `period` 和 `clock` 字段（即使是空字符串）
- 导致大量未开赛的比赛被错误分类为滚球

**修复**：
```typescript
const isLive = match.state === 1 || match.state === '1';
if (isLive) {
  showtype = 'live';
}
```

### 问题 2：错误地将 state > 0 的所有状态都判断为滚球

**错误代码**：
```typescript
const isLiveState = (value: any): boolean => {
  const state = normalizeStateValue(value);
  return state > 0 && state !== 3 && state !== -1;
};
```

**问题**：
- `state: 2`（中场休息）也被判断为滚球
- 导致数据分类错误

**修复**：
```typescript
const isLiveState = (value: any): boolean => {
  const state = normalizeStateValue(value);
  return state === 1; // 只有 1 才是滚球
};
```

## 📊 数据示例

### 滚球比赛（state=1）

```json
{
  "gid": "356049825",
  "home": "塞曼巴东",
  "away": "阿雷马",
  "state": 1,
  "period": "滚球",
  "clock": "",
  "score": "0-0"
}
```

### 未开赛比赛（state=0）

```json
{
  "gid": "356049826",
  "home": "球队A",
  "away": "球队B",
  "state": 0,
  "period": "未开赛",
  "clock": "",
  "score": ""
}
```

### 中场休息（state=2）

```json
{
  "gid": "356049824",
  "home": "乌法",
  "away": "克拉斯诺亚尔斯克",
  "state": 2,
  "period": "",
  "clock": "",
  "score": "1-0"
}
```

## 🔧 修复的文件

1. **`backend/scripts/fetch-crown-gids.ts`**
   - 修复：只用 `state === 1` 判断滚球
   - 移除：对 `period`/`clock` 字段的简单判断

2. **`backend/src/routes/crown-automation.ts`**
   - 修复：`isLiveState()` 只返回 `state === 1`
   - 修复：`isLiveMatch()` 优先判断 `state === 1`
   - 增强：对 `period` 内容的检查，排除"未开赛"、"已结束"等状态
   - 增强：对 `clock` 值的检查，排除空字符串和 `00:00`

## 📚 参考文档

- [iSportsAPI - Schedule & Results (Basic)](https://www.isportsapi.com/docs.html?id=41&lang=en)
- [iSportsAPI - Pre-match and In-play Odds (Main)](https://www.isportsapi.com/docs.html?id=24&lang=en)

## 🎯 总结

- **比赛分类**（滚球/今日/早盘）应该基于 **`state`** 字段
- **赔率类型**（早期/即时/滚球）应该基于 **`oddsType`** 字段
- 两者是**独立的概念**，不要混淆
- 只有 `state === 1` 才是真正的滚球比赛

