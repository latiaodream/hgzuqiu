# 皇冠与 iSports 数据源整合方案

## 概述

本文档描述了将皇冠作为主数据源,iSports 作为补充信息的数据整合方案。

## 目标

1. **皇冠有盘口但 iSports 没列出的比赛,也要在前端看见（并能下注）**
2. **若能匹配到 iSports 的 matchId,继续沿用现在的流程（语言、赔率、映射等）**
3. **匹配不到时,也不要隐藏,直接用皇冠原始信息展示（至少能看到对阵、盘口、赔率）**

## 技术实现

### 1. 数据抓取流程

#### 皇冠数据抓取
```bash
# 运行皇冠赛事抓取脚本
cd backend
npm run crown:fetch-gids
```

这会生成 `crown-gids.json`,包含当天所有 live/today/early 的比赛:
- gid (比赛ID)
- league (联赛名)
- home/away (主客队)
- datetime (比赛时间)
- source_showtype (live/today/early)

#### iSports 数据抓取
fetcher-isports 服务会自动:
1. 获取 iSports 赛程数据
2. 获取 iSports 赔率数据
3. 读取 `crown-match-map.json` 进行匹配

### 2. 数据合并逻辑

在 `fetcher-isports/src/index.ts` 的 `generateOutput()` 函数中:

```typescript
function generateOutput() {
  // 第一步：处理 iSports 匹配的比赛
  const isportsMatches = matchesCache
    .filter(match => crownMatchDetails.has(matchId))
    .map(match => {
      // 使用 iSports 中文翻译
      // 标记 source = 'isports'
    });

  // 第二步：处理皇冠独有的比赛
  const crownOnlyMatches = crownMatches
    .filter(crownMatch => !usedCrownGids.has(gid))
    .map(crownMatch => {
      // 使用皇冠原始信息
      // 标记 source = 'crown'
    });

  // 合并两部分数据
  const allMatches = [...isportsMatches, ...crownOnlyMatches];
  saveData(allMatches);
}
```

### 3. 数据结构

每场比赛数据包含 `source` 字段:

```typescript
{
  gid: string,              // 比赛ID (iSports matchId 或 皇冠 gid)
  crown_gid: string,        // 皇冠 gid (用于下注)
  source: 'isports' | 'crown' | 'hybrid',  // 数据来源标记
  league: string,           // 联赛名
  home: string,             // 主队名
  away: string,             // 客队名
  timer: string,            // 比赛时间 (ISO格式)
  score: string,            // 比分
  period: string,           // 比赛阶段
  state: number,            // 比赛状态 (0=未开赛, 1=滚球, -1=已结束)
  
  // 赔率数据
  RATIO_RE: string,         // 让球盘口
  IOR_REH: string,          // 让球主队赔率
  IOR_REC: string,          // 让球客队赔率
  IOR_RMH: string,          // 独赢主队赔率
  IOR_RMN: string,          // 独赢和局赔率
  IOR_RMC: string,          // 独赢客队赔率
  RATIO_ROUO: string,       // 大小球盘口
  IOR_ROUC: string,         // 大球赔率
  IOR_ROUH: string,         // 小球赔率
  // ... 更多赔率字段
  
  markets: {                // 结构化赔率数据
    full: { ... },
    half: { ... }
  }
}
```

### 4. 前端显示

在 `frontend/src/pages/MatchesPage.tsx` 中:

```typescript
// 数据来源标记
const source = m.source || 'isports';
const sourceLabel = source === 'crown' ? '皇冠' : source === 'isports' ? 'iSports' : '混合';
const sourceColor = source === 'crown' ? '#ff9800' : source === 'isports' ? '#4caf50' : '#2196f3';

// 显示在联赛名称旁边
<div className="match-league">
  ☆ {leagueLabel}
  <span style={{ color: sourceColor }}>
    [{sourceLabel}]
  </span>
</div>
```

颜色标记:
- 🟢 **绿色 [iSports]**: 有 iSports 匹配,含中文翻译
- 🟠 **橙色 [皇冠]**: 皇冠独有,无 iSports 匹配
- 🔵 **蓝色 [混合]**: 混合数据源 (预留)

### 5. 下注流程

下注流程**无需修改**,因为:
1. 所有比赛都有 `crown_gid` 字段
2. 下注时使用 `crown_gid` 调用皇冠 API
3. 下注前会调用 `/crown-automation/odds/preview` 获取最新赔率
4. 数据来源不影响下注逻辑

```typescript
// 下注请求
const betResult = await crownApi.placeBet({
  account_ids: selectedAccounts,
  crown_match_id: match.crown_gid,  // 使用 crown_gid
  bet_type: '让球',
  bet_option: '主队',
  bet_amount: 100,
  odds: 1.95,
  // ...
});
```

## 使用流程

### 1. 启动服务

```bash
# 1. 启动 fetcher-isports 服务
cd fetcher-isports
npm run dev

# 2. 定期运行皇冠数据抓取 (可以设置 cron job)
cd backend
npm run crown:fetch-gids

# 3. 运行匹配脚本 (可选,用于更新映射)
npm run crown:build-map
```

### 2. 数据更新频率

- **iSports 完整更新**: 每 60 秒
- **iSports 增量更新**: 每 2 秒
- **皇冠数据抓取**: 建议每 5-10 分钟运行一次 `crown:fetch-gids`

### 3. 前端使用

前端无需修改,自动显示:
- 所有 iSports 匹配的比赛 (绿色标记)
- 所有皇冠独有的比赛 (橙色标记)
- 用户可以对任何比赛下注

## 优势

1. ✅ **覆盖更全**: 皇冠有的比赛都能看到和下注
2. ✅ **中文友好**: iSports 匹配的比赛有中文翻译
3. ✅ **下注无阻**: 所有比赛都能下注,不受数据源限制
4. ✅ **透明标记**: 用户知道数据来源,可以自行判断
5. ✅ **向后兼容**: 不影响现有下注流程

## 注意事项

1. **皇冠独有比赛的赔率**: 
   - 初始显示为 0 (因为没有 iSports 赔率)
   - 下注前会通过 `/crown-automation/odds/preview` 获取最新赔率
   - 建议在前端提示用户"点击下注查看最新赔率"

2. **时间解析**:
   - 皇冠时间格式: "11-05 08:10p"
   - 需要正确解析为 ISO 格式
   - 注意时区处理

3. **比赛状态判断**:
   - `source_showtype='live'` → 滚球
   - 时间已过 → 已结束
   - 其他 → 未开赛

## 未来优化

1. **实时赔率获取**: 为皇冠独有比赛定期获取赔率
2. **自动匹配优化**: 改进匹配算法,提高匹配率
3. **数据缓存**: 缓存皇冠赔率,减少 API 调用
4. **用户偏好**: 允许用户选择只看某个数据源

## 相关文件

- `fetcher-isports/src/index.ts` - 数据合并逻辑
- `backend/scripts/fetch-crown-gids.ts` - 皇冠数据抓取
- `backend/scripts/map-crown-to-isports-v2.ts` - 数据匹配
- `frontend/src/pages/MatchesPage.tsx` - 前端显示
- `frontend/src/components/Betting/BetFormModal.tsx` - 下注弹窗

## 测试

```bash
# 1. 测试皇冠数据抓取
cd backend
npm run crown:fetch-gids
# 检查 crown-gids.json 是否生成

# 2. 测试数据合并
cd fetcher-isports
npm run dev
# 检查 data/latest-matches.json 中是否有 source 字段

# 3. 测试前端显示
# 访问前端,查看比赛列表是否显示数据来源标记

# 4. 测试下注
# 选择一个皇冠独有的比赛,尝试下注
# 检查是否能正常获取赔率和下注
```

