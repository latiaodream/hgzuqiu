# iSportsAPI 集成方案

## 概述

iSportsAPI 是一个专业的体育数据服务商，支持包括皇冠（Crown）在内的 18 家主流博彩公司的赔率数据。

## 为什么选择 iSportsAPI

### 优势

1. ✅ **支持皇冠（Crown）**：Company ID = 3
2. ✅ **稳定可靠**：专业数据服务商，不会被封账号
3. ✅ **实时更新**：每 20 秒更新一次赔率变化
4. ✅ **免费试用**：15 天免费试用，每天 200 次调用
5. ✅ **覆盖全面**：1600+ 联赛，支持赛前和滚球
6. ✅ **亚洲数据商**：专注亚洲市场，数据质量高

### 支持的博彩公司

- **1**: Macauslot
- **3**: Crown（皇冠）✅
- **4**: Ladbrokes
- **7**: SNAI
- **8**: Bet365
- **9**: William Hill
- **12**: Easybets
- **14**: Vcbet
- **17**: Mansion88
- **19**: Interwette
- **22**: 10BET
- **23**: 188bet
- **24**: 12bet
- **31**: Sbobet
- **35**: Wewbet
- **42**: 18bet
- **47**: Pinnacle
- **48**: HK Jockey Club
- **49**: Bwin
- **50**: 1xbet

## 产品套餐

### Football - Odds（基础版）

- **价格**: $449/月（季付 11% 折扣，年付 26% 折扣）
- **包含**: 18 家博彩公司的赔率数据
- **API 数量**: 17 个端点
- **免费试用**: 15 天，每天 200 次调用

### Football - Odds Pro（专业版）

- **价格**: $599/月（季付 11% 折扣，年付 25% 折扣）
- **包含**: 18 家博彩公司 + 200+ 欧洲博彩公司的赔率数据
- **API 数量**: 36 个端点
- **免费试用**: 15 天，每天 200 次调用

## API 功能

### 支持的赔率类型

- **亚洲让球盘**（Asian Handicap）
- **独赢盘**（1x2 / Moneyline / Europe Odds）
- **大小球**（Over/Under）
- **半场盘口**（Half-time markets）
- **赛前赔率**（Pre-match Odds）
- **滚球赔率**（In-play Odds）
- **历史赔率**（Historical Odds）
- **实时赔率变化**（Live Odds Changes - 每 20 秒更新）

### 主要 API 端点

1. **赛程 API**（免费）
   - `GET /sport/football/schedule/basic`
   - 获取比赛基本信息

2. **赛前赔率 API**（需订阅）
   - `GET /sport/football/odds/prematch`
   - 获取赛前主盘口赔率

3. **滚球赔率 API**（需订阅）
   - `GET /sport/football/odds/inplay`
   - 获取滚球主盘口赔率

4. **实时赔率变化 API**（需订阅）
   - `GET /sport/football/odds/changes`
   - 获取过去 20 秒的赔率变化

5. **历史赔率 API**（需订阅）
   - `GET /sport/football/odds/history`
   - 获取历史初盘和终盘数据

## 集成方案

### 方案 1：完全替换（推荐）

**优点**：
- 彻底解决账号被封问题
- 数据稳定可靠
- 维护成本低

**缺点**：
- 需要付费订阅（$449/月）
- 数据格式需要转换

**实施步骤**：

1. **申请免费试用**
   - 登录 https://www.isportsapi.com/
   - 点击 "Start Free Trial"
   - 选择 "Football - Odds" 产品
   - 提交申请，等待审核通过

2. **创建 iSportsAPI 客户端**
   - 创建 `backend/src/services/isports-client.ts`
   - 实现赔率数据获取逻辑
   - 实现数据格式转换

3. **替换独立抓取服务**
   - 修改 `fetcher/src/index.ts`
   - 使用 iSportsAPI 替代皇冠 API
   - 保持数据输出格式不变

4. **测试验证**
   - 验证赔率数据准确性
   - 验证实时更新频率
   - 验证系统兼容性

### 方案 2：混合模式

**优点**：
- 降低成本（免费试用期间）
- 保留现有逻辑作为备份

**缺点**：
- 维护成本高
- 逻辑复杂

**实施步骤**：

1. **保留现有皇冠 API 抓取**
2. **添加 iSportsAPI 作为备用数据源**
3. **当皇冠 API 失败时，切换到 iSportsAPI**

### 方案 3：仅用于数据对比

**优点**：
- 成本最低
- 可以验证数据准确性

**缺点**：
- 不解决账号被封问题

**实施步骤**：

1. **同时调用皇冠 API 和 iSportsAPI**
2. **对比两个数据源的赔率**
3. **记录差异，用于数据质量监控**

## 数据格式转换

### iSportsAPI 赔率数据格式

```json
{
  "matchId": "227028829",
  "companyId": 3,
  "handicap": 0.25,
  "homeOdds": 0.95,
  "awayOdds": 0.85,
  "europeOdds": {
    "home": 2.10,
    "draw": 3.40,
    "away": 3.20
  },
  "overUnder": {
    "line": 2.5,
    "over": 0.90,
    "under": 0.90
  }
}
```

### 皇冠 API 数据格式

```json
{
  "gid": "227028829",
  "ratio": "0.25",
  "ratio_o": "0.95",
  "ratio_u": "0.85",
  "ior_RH": "2.10",
  "ior_RN": "3.40",
  "ior_RC": "3.20"
}
```

### 转换逻辑

```typescript
function convertISportsToCrown(isportsData: any) {
  return {
    gid: isportsData.matchId,
    ratio: isportsData.handicap?.toString() || '0',
    ratio_o: isportsData.homeOdds?.toString() || '0',
    ratio_u: isportsData.awayOdds?.toString() || '0',
    ior_RH: isportsData.europeOdds?.home?.toString() || '0',
    ior_RN: isportsData.europeOdds?.draw?.toString() || '0',
    ior_RC: isportsData.europeOdds?.away?.toString() || '0',
    ratio_uo: isportsData.overUnder?.line?.toString() || '0',
    ratio_uo_o: isportsData.overUnder?.over?.toString() || '0',
    ratio_uo_u: isportsData.overUnder?.under?.toString() || '0',
  };
}
```

## 成本分析

### 当前方案（皇冠 API）

- **成本**: 免费
- **风险**: 账号被封，数据不稳定
- **维护成本**: 高（需要处理账号被封、登录失败等问题）

### iSportsAPI 方案

- **成本**: $449/月（基础版）或 $599/月（专业版）
- **风险**: 低（专业数据服务商）
- **维护成本**: 低（API 稳定，无需处理账号问题）

### ROI 分析

假设你的系统每月产生的价值为 $X：

- 如果 $X > $449，使用 iSportsAPI 是值得的
- 如果 $X < $449，可以考虑混合模式或继续使用皇冠 API

## 下一步行动

1. ✅ **已完成**：注册 iSportsAPI 账号
2. ✅ **已完成**：获取 API Key
3. ⏳ **待完成**：申请免费试用
4. ⏳ **待完成**：测试皇冠赔率数据
5. ⏳ **待完成**：评估数据质量
6. ⏳ **待完成**：决定集成方案
7. ⏳ **待完成**：实施集成

## 联系方式

- **官网**: https://www.isportsapi.com/
- **文档**: https://www.isportsapi.com/docs
- **WhatsApp**: Kimi / Raymond（见官网）
- **邮箱**: 见官网联系页面

## 参考资料

- [iSportsAPI 官方文档](https://www.isportsapi.com/docs)
- [Football Odds API 文档](https://www.isportsapi.com/products/detail-new/football-odds-53.html)
- [Football Odds Pro API 文档](https://www.isportsapi.com/products/detail/football-api-product-54.html)

