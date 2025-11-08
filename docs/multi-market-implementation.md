# 多盘口功能实现文档

## 1. 功能概述

多盘口功能允许系统为每场比赛显示多个让球盘口和大小球盘口，而不是只显示单一的主盘口。这使得用户可以看到更多的投注选项，与竞争对手的功能保持一致。

### 1.1 功能特点

- **滚球比赛**：每场比赛显示 2-4 条让球盘口 + 2-4 条大小球盘口
- **今日/早盘比赛**：每场比赛显示 3-4 条让球盘口 + 3-4 条大小球盘口
- **半场盘口**：同样支持多个半场让球和大小球盘口
- **语言支持**：优先使用简体中文（zh-cn）

## 2. 技术实现原理

### 2.1 Crown API 数据结构

Crown API 的 `get_game_more` 接口返回的 XML 数据中，每个 `<game>` 节点代表一个独立的盘口。同一场比赛会有多个 `<game>` 节点，每个节点包含不同的让球线和赔率。

**XML 结构示例**：

```xml
<game id="gid8276297" master="Y">
  <ratio>0</ratio>
  <ratio_o>2 / 2.5</ratio_o>
  <ior_RH>0.93</ior_RH>
  <ior_RC>0.96</ior_RC>
  <ior_OUH>0.94</ior_OUH>
  <ior_OUC>0.94</ior_OUC>
</game>
<game id="gid8276299" master="N">
  <ratio>0 / 0.5</ratio>
  <ratio_o>2</ratio_o>
  <ior_RH>1.31</ior_RH>
  <ior_RC>0.59</ior_RC>
  <ior_OUH>0.80</ior_OUH>
  <ior_OUC>1.09</ior_OUC>
</game>
<game id="gid8276301" master="N">
  <ratio>0.5</ratio>
  <ratio_o>3 / 3.5</ratio_o>
  <ior_RH>0.58</ior_RH>
  <ior_RC>1.32</ior_RC>
  <ior_OUH>1.22</ior_OUH>
  <ior_OUC>0.67</ior_OUC>
</game>
```

**关键字段说明**：
- `master="Y"`：主盘口
- `master="N"`：副盘口
- `ratio`：让球线
- `ratio_o`：大小球线
- `ior_RH/ior_RC`：让球赔率（主队/客队）
- `ior_OUH/ior_OUC`：大小球赔率（大/小）

### 2.2 字段名称映射

Crown API 在不同场景下使用不同的字段名：

| 盘口类型 | 让球字段 | 大小球字段 | 赔率字段前缀 |
|---------|---------|-----------|------------|
| 滚球全场 | `RE`, `ratio` | `ROU`, `ratio_o`, `ratio_u` | `ior_RE`, `ior_ROU` |
| 今日/早盘全场 | `R`, `ratio` | `OU`, `ratio_o`, `ratio_u` | `ior_R`, `ior_OU` |
| 滚球半场 | `HRE`, `hratio` | `HROU`, `hratio_o`, `hratio_u` | `ior_HRE`, `ior_HROU` |
| 今日/早盘半场 | `HR`, `hratio` | `HOU`, `hratio_o`, `hratio_u` | `ior_HR`, `ior_HOU` |

### 2.3 角球盘口过滤

Crown API 返回的数据中包含角球盘口和罚牌数盘口，需要过滤掉这些特殊盘口。

**过滤规则**：
1. 检查 `mode` 属性：
   - `mode="FT"`：全场进球盘口 ✅
   - `mode="CN"`：角球盘口 ❌
   - `mode="RN"`：罚牌数盘口 ❌

2. 检查 `ptype` 字段：
   - 包含 "角球" 或 "罰牌" ❌

3. 检查队伍名称：
   - 包含 "角球" 或 "罚牌数" ❌

## 3. 核心代码实现

### 3.1 parseMoreMarkets 函数

位置：`fetcher/src/crown-client.ts`

```typescript
private parseMoreMarkets(xml: string): {
  handicapLines: any[];
  overUnderLines: any[];
  halfHandicapLines: any[];
  halfOverUnderLines: any[];
  halfMoneyline?: { home?: string; draw?: string; away?: string };
  homeTeam?: string;
  awayTeam?: string;
  matchTime?: string;
  league?: string;
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    trimValues: true,
  });

  const parsed = parser.parse(xml);
  const gameArray = Array.isArray(parsed?.game) ? parsed.game : (parsed?.game ? [parsed.game] : []);

  const handicapLines: any[] = [];
  const overUnderLines: any[] = [];
  const halfHandicapLines: any[] = [];
  const halfOverUnderLines: any[] = [];
  let halfMoneyline: { home?: string; draw?: string; away?: string } | undefined;
  let homeTeam: string | undefined;
  let awayTeam: string | undefined;
  let matchTime: string | undefined;
  let league: string | undefined;

  for (const game of gameArray) {
    // 提取队伍名称（只在第一个节点提取）
    if (!homeTeam) {
      homeTeam = pickString(game, ['TEAM_H', 'team_h', 'TEAM_H_CN', 'team_h_cn', 'TEAM_H_E', 'TEAM_H_TW']);
    }
    if (!awayTeam) {
      awayTeam = pickString(game, ['TEAM_C', 'team_c', 'TEAM_C_CN', 'team_c_cn', 'TEAM_C_E', 'TEAM_C_TW']);
    }

    // 过滤角球和罚牌数盘口
    const mode = pickString(game, ['@_mode', 'mode']);
    const ptype = pickString(game, ['@_ptype', 'ptype']);
    const teamH = pickString(game, ['TEAM_H', 'team_h']);
    const teamC = pickString(game, ['TEAM_C', 'team_c']);

    if (mode === 'CN' || mode === 'RN' || 
        ptype?.includes('角球') || ptype?.includes('罰牌') ||
        teamH?.includes('角球') || teamH?.includes('罚牌数') ||
        teamC?.includes('角球') || teamC?.includes('罚牌数')) {
      continue;
    }

    // 解析全场让球盘口
    const handicapLine = pickString(game, ['RE', 'R', 'ratio']);
    const handicapHome = pickString(game, ['ior_REH', 'ior_RH']);
    const handicapAway = pickString(game, ['ior_REC', 'ior_RC']);
    
    if (handicapLine && handicapHome && handicapAway) {
      handicapLines.push({
        line: handicapLine,
        home: handicapHome,
        away: handicapAway,
      });
    }

    // 解析全场大小球盘口
    const ouLine = pickString(game, ['ROU', 'OU', 'ratio_o', 'ratio_u']);
    const ouOver = pickString(game, ['ior_ROUH', 'ior_OUH']);
    const ouUnder = pickString(game, ['ior_ROUC', 'ior_OUC']);
    
    if (ouLine && ouOver && ouUnder) {
      overUnderLines.push({
        line: ouLine,
        over: ouOver,
        under: ouUnder,
      });
    }

    // 解析半场让球盘口
    const halfHandicapLine = pickString(game, ['HRE', 'HR', 'hratio']);
    const halfHandicapHome = pickString(game, ['ior_HREH', 'ior_HRH']);
    const halfHandicapAway = pickString(game, ['ior_HREC', 'ior_HRC']);
    
    if (halfHandicapLine && halfHandicapHome && halfHandicapAway) {
      halfHandicapLines.push({
        line: halfHandicapLine,
        home: halfHandicapHome,
        away: halfHandicapAway,
      });
    }

    // 解析半场大小球盘口
    const halfOuLine = pickString(game, ['HROU', 'HOU', 'hratio_o', 'hratio_u']);
    const halfOuOver = pickString(game, ['ior_HROUH', 'ior_HOUH']);
    const halfOuUnder = pickString(game, ['ior_HROUC', 'ior_HOUC']);
    
    if (halfOuLine && halfOuOver && halfOuUnder) {
      halfOverUnderLines.push({
        line: halfOuLine,
        over: halfOuOver,
        under: halfOuUnder,
      });
    }
  }

  return {
    handicapLines,
    overUnderLines,
    halfHandicapLines,
    halfOverUnderLines,
    halfMoneyline,
    homeTeam,
    awayTeam,
    matchTime,
    league
  };
}
```

### 3.2 get_game_more API 调用

位置：`fetcher/src/crown-client.ts`

```typescript
async getGameMore(params: {
  gtype: string;
  showtype: string;
  ltype: string;
  ecid: string;
  lid: string;
  gid: string;
  isRB: string;
}): Promise<string | null> {
  try {
    if (!this.uid) return null;

    const buildParams = (opt: { 
      useEcid?: boolean; 
      useGid?: boolean; 
      includeLid?: boolean; 
      langx?: string; 
    }) => {
      const p = new URLSearchParams({
        uid: this.uid || '',
        ver: this.version,
        langx: opt.langx ?? 'zh-cn',  // 优先使用简体中文
        p: 'get_game_more',
        gtype: params.gtype,
        showtype: params.showtype,
        ltype: params.ltype,
        isRB: params.isRB,
        specialClick: '',
        from: 'game_more',
        filter: 'All',
        ts: Date.now().toString(),
      });
      if (opt.includeLid !== false && params.lid) p.set('lid', params.lid);
      if (opt.useEcid) p.set('ecid', params.gid);
      if (opt.useGid) p.set('gid', params.gid);
      return p;
    };

    // 尝试不同的参数组合，优先使用简体中文
    const attempts = [
      { label: 'ecid+gid+lid zh-cn', useEcid: true, useGid: true, includeLid: true, langx: 'zh-cn' },
      { label: 'gid+lid zh-cn', useEcid: false, useGid: true, includeLid: true, langx: 'zh-cn' },
      { label: 'ecid only zh-cn', useEcid: true, useGid: false, includeLid: false, langx: 'zh-cn' },
      { label: 'gid only zh-cn', useEcid: false, useGid: true, includeLid: false, langx: 'zh-cn' },
      { label: 'gid only zh-tw', useEcid: false, useGid: true, includeLid: false, langx: 'zh-tw' },
    ];

    for (const att of attempts) {
      const requestParams = buildParams(att);
      const res = await this.client.post(`/transform.php?ver=${this.version}`, 
        requestParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (res.data && typeof res.data === 'string' && res.data.includes('<game')) {
        console.log(`ℹ️ get_game_more(${params.showtype}) [${att.label}] -> xml=Y len=${res.data.length}`);
        return res.data;
      }
    }

    console.warn(`⚠️ API返回空: ${params.gid}`);
    return null;
  } catch (error) {
    console.error('❌ get_game_more 失败:', error);
    return null;
  }
}
```

## 4. 数据流程

### 4.1 完整流程图

```
1. get_game_list (获取比赛列表)
   ↓
2. 筛选需要补全多盘口的比赛
   ↓
3. 对每场比赛调用 get_game_more
   ↓
4. parseMoreMarkets 解析 XML
   ↓
5. 过滤角球/罚牌数盘口
   ↓
6. 提取多个让球和大小球盘口
   ↓
7. 更新比赛数据
   ↓
8. 保存到 latest-matches.json
```

### 4.2 数据更新频率

| 比赛类型 | 更新间隔 | 说明 |
|---------|---------|------|
| 滚球 (live) | 2秒 | 实时性最高，赔率变化快 |
| 今日 (today) | 10秒 | 平衡实时性和服务器压力 |
| 早盘 (early) | 1小时 | 赔率变化慢，减少不必要的请求 |

配置文件：`fetcher/.env`

```env
LIVE_INTERVAL=2000        # 滚球: 2秒
TODAY_INTERVAL=10000      # 今日: 10秒
EARLY_INTERVAL=3600000    # 早盘: 1小时
```

## 5. 关键问题与解决方案

### 5.1 问题：只显示1条盘口

**原因**：之前的过滤逻辑 `if (__keys.some(k => /CN/i.test(String(k))))` 太严格，检查的是字段名是否包含 "CN"，而不是检查盘口类型。由于所有节点都包含角球相关字段（如 `sw_CN`），导致所有节点都被过滤掉。

**解决方案**：改为只检查 `mode` 属性和 `ptype`/队名是否包含"角球"或"罰牌"。

### 5.2 问题：球队名字显示为繁体中文

**原因**：`get_game_more` 默认使用 `langx=zh-tw`（繁体中文）。

**解决方案**：
1. 修改默认语言为 `zh-cn`（简体中文）
2. 调整尝试顺序，优先使用简体中文
3. 添加 `TEAM_H_CN` 和 `TEAM_C_CN` 字段支持

### 5.3 问题：球队名字显示为 undefined

**原因**：`get_game_list` 返回的数据中没有球队名字字段，需要从 `get_game_more` 中提取。

**解决方案**：在 `parseMoreMarkets` 中提取 `TEAM_H_CN` 和 `TEAM_C_CN` 字段，并在主流程中更新比赛数据。

## 6. 测试验证

### 6.1 验证多盘口数量

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('fetcher/data/latest-matches.json', 'utf8'));
const live = data.matches.filter(m => m.showtype === 'live');
console.log('滚球比赛示例：');
live.slice(0, 3).forEach((m, i) => {
  console.log(\`[\${i+1}] \${m.homeTeam} vs \${m.awayTeam}\`);
  console.log(\`    让球: \${m.markets.full.handicapLines.length}条\`);
  console.log(\`    大小: \${m.markets.full.overUnderLines.length}条\`);
});
"
```

### 6.2 验证语言设置

检查日志输出，确认使用的是 `zh-cn`：

```
ℹ️ get_game_more(live) [ecid+gid+lid zh-cn] -> xml=Y len=118585
✅ [柏林联 vs 拜仁慕尼黑] H:4 OU:4 HH:2 HOU:2
```

## 7. 性能优化

### 7.1 批量处理

每次抓取最多处理 50 场比赛的多盘口补全，避免单次请求过多导致超时。

### 7.2 错误处理

对于 API 返回空的比赛，记录警告日志但不中断流程：

```typescript
if (!moreXml) {
  console.warn(`⚠️ API返回空: ${match.homeTeam} vs ${match.awayTeam}`);
  continue;
}
```

### 7.3 缓存机制

使用独立的缓存对象存储不同类型比赛的数据，减少重复抓取：

```typescript
const cachedMatches = {
  live: [] as any[],
  today: [] as any[],
  early: [] as any[],
};
```

## 8. 未来改进方向

1. **动态调整更新频率**：根据比赛状态（进行中/未开始）动态调整更新间隔
2. **智能过滤**：只对热门比赛进行多盘口补全，减少 API 调用
3. **缓存优化**：对于赔率变化不大的比赛，延长缓存时间
4. **错误重试**：对于失败的 API 调用，实现指数退避重试机制

## 9. 相关文件

- `fetcher/src/crown-client.ts`：核心实现
- `fetcher/src/index.ts`：主流程和更新频率控制
- `fetcher/.env`：配置文件
- `fetcher/data/latest-matches.json`：输出数据

---

**文档版本**：v1.0  
**最后更新**：2025-11-08  
**作者**：开发团队

