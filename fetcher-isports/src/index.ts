/**
 * iSportsAPI 独立抓取服务
 *
 * 工作原理：
 * 1. 首次启动：获取完整的赛前和滚球赔率数据（/odds/all - 支持多个盘口）
 * 2. 定期完整更新：每 60 秒获取一次完整数据（符合 /schedule/basic 接口限制）
 * 3. 实时增量更新：每 2 秒获取过去 20 秒内变化的赔率（/odds/all/changes）
 * 4. 合并数据：将变化的赔率更新到缓存中
 *
 * API 调用频率限制：
 * - /schedule/basic: 每 60 秒最多 1 次
 * - /odds/all: 根据套餐限制
 * - /odds/all/changes: 每 2 秒 1 次
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = process.env.ISPORTS_API_KEY || 'GvpziueL9ouzIJNj';
const BASE_URL = 'http://api.isportsapi.com/sport/football';
const DATA_DIR = process.env.DATA_DIR || './data';
// 设置为 60 秒（60000ms），符合 /schedule/basic 接口的 "每 60 秒最多 1 次" 限制
const FULL_FETCH_INTERVAL = parseInt(process.env.FULL_FETCH_INTERVAL || '60000');
const CHANGES_INTERVAL = parseInt(process.env.CHANGES_INTERVAL || '2000');
const USE_ALL_ODDS = true; // 使用 /odds/all 端点获取多个盘口

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let matchesCache: any[] = [];
let oddsCache: Map<string, any> = new Map();

// API 调用统计
let apiCallStats = {
  schedule: 0,
  mainOdds: 0,
  changes: 0,
  errors: 0,
  limitExceeded: false,
  lastResetDate: new Date().toISOString().split('T')[0],
};

function checkAndResetStats() {
  const today = new Date().toISOString().split('T')[0];
  if (apiCallStats.lastResetDate !== today) {
    console.log('📊 昨日 API 调用统计:');
    console.log(`   赛程: ${apiCallStats.schedule} 次`);
    console.log(`   主赔率: ${apiCallStats.mainOdds} 次`);
    console.log(`   赔率变化: ${apiCallStats.changes} 次`);
    console.log(`   总计: ${apiCallStats.schedule + apiCallStats.mainOdds + apiCallStats.changes} 次`);
    console.log(`   错误: ${apiCallStats.errors} 次`);

    apiCallStats = {
      schedule: 0,
      mainOdds: 0,
      changes: 0,
      errors: 0,
      limitExceeded: false,
      lastResetDate: today,
    };
    console.log('✅ 统计已重置');
  }
}

function printStats() {
  const total = apiCallStats.schedule + apiCallStats.mainOdds + apiCallStats.changes;
  console.log(`📊 今日 API 调用: ${total} 次 (赛程: ${apiCallStats.schedule}, 主赔率: ${apiCallStats.mainOdds}, 变化: ${apiCallStats.changes}, 错误: ${apiCallStats.errors})`);
  if (apiCallStats.limitExceeded) {
    console.log('⚠️  已超出免费试用限制 (200 次/天)');
  }
}

// 使用 Common API 中的 /schedule/basic 接口（应该在套餐内）
async function fetchSchedule() {
  checkAndResetStats();
  apiCallStats.schedule++;

  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(`${BASE_URL}/schedule/basic`, {
      params: { api_key: API_KEY, date: today },
      timeout: 30000,
    });

    if (response.data.code === 0) {
      const allMatches = response.data.data || [];

      // 统计各状态比赛数量（注意：字段名是 status 不是 state）
      // status: -1=已结束, 0=未开始(早盘), 1=进行中(滚球)
      const liveCount = allMatches.filter((m: any) => m.status === 1).length;
      const earlyCount = allMatches.filter((m: any) => m.status === 0).length;
      const finishedCount = allMatches.filter((m: any) => m.status === -1).length;

      console.log(`📊 今日比赛: 总数 ${allMatches.length} (滚球 ${liveCount}, 早盘 ${earlyCount}, 已结束 ${finishedCount})`);

      // 返回所有比赛，让后端根据前端的 showtype 参数过滤
      return allMatches;
    } else {
      apiCallStats.errors++;
      console.error('❌ 获取赛程失败:', response.data);
      if (response.data.code === 2) {
        apiCallStats.limitExceeded = true;
        console.error('⚠️  /schedule/basic 接口超出限制！');
        console.error('   请确认该接口是否在你的套餐内（Common API）');
        console.error('   如果不在套餐内，请联系 iSportsAPI 客服');
        printStats();
      }
      return [];
    }
  } catch (error: any) {
    apiCallStats.errors++;
    console.error('❌ 获取赛程失败:', error.message);
    return [];
  }
}

async function fetchMainOdds() {
  checkAndResetStats();
  apiCallStats.mainOdds++;

  try {
    const endpoint = USE_ALL_ODDS ? '/odds/all' : '/odds/main';
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      params: { api_key: API_KEY, companyId: '3' },
      timeout: 30000,
    });

    if (response.data.code === 0) {
      return response.data.data;
    } else {
      apiCallStats.errors++;
      console.error('❌ 获取赔率失败:', response.data);
      if (response.data.code === 2) {
        apiCallStats.limitExceeded = true;
        console.error('⚠️  API 调用次数已超出限制！');
        console.error('   免费试用：200 次/天');
        console.error('   请等待明天重置或升级到付费计划');
        printStats();
      }
      return null;
    }
  } catch (error: any) {
    apiCallStats.errors++;
    console.error('❌ 获取赔率失败:', error.message);
    return null;
  }
}

async function fetchOddsChanges() {
  checkAndResetStats();
  apiCallStats.changes++;

  try {
    const endpoint = USE_ALL_ODDS ? '/odds/all/changes' : '/odds/main/changes';
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      params: { api_key: API_KEY, companyId: '3' },
      timeout: 30000,
    });

    if (response.data.code === 0) {
      return response.data.data;
    } else if (response.data.code === 2) {
      apiCallStats.errors++;
      if (!apiCallStats.limitExceeded) {
        apiCallStats.limitExceeded = true;
        console.error('⚠️  API 调用次数已超出限制！');
        printStats();
      }
      return null;
    } else {
      apiCallStats.errors++;
      console.error('❌ 获取赔率变化失败:', response.data);
      return null;
    }
  } catch (error: any) {
    apiCallStats.errors++;
    return null;
  }
}

const parseBool = (value?: string) => value === 'true' || value === '1';
const parseIntSafe = (value?: string) => {
  if (value === undefined || value === '') return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function parseOdds(data: string[], type: string) {
  return data.map((item) => {
    const parts = item.split(',');
    const base: any = { matchId: parts[0], companyId: parts[1], raw: item };
    const len = parts.length;

    if (type === 'handicap') {
      if (len >= 15) {
        return {
          ...base,
          initialHandicap: parts[2],
          initialHome: parts[3],
          initialAway: parts[4],
          instantHandicap: parts[5],
          instantHome: parts[6],
          instantAway: parts[7],
          maintenance: parseBool(parts[8]),
          inPlay: parseBool(parts[9]),
          handicapIndex: parseIntSafe(parts[10]) ?? 1,
          handicapCount: parseIntSafe(parts[11]) ?? 1,
          changeTime: parseIntSafe(parts[12]),
          close: parseBool(parts[13]),
          oddsType: parseIntSafe(parts[14]),
        };
      }

      return {
        ...base,
        instantHandicap: parts[2],
        instantHome: parts[3],
        instantAway: parts[4],
        maintenance: parseBool(parts[5]),
        inPlay: parseBool(parts[6]),
        handicapIndex: parseIntSafe(parts[7]) ?? 1,
        changeTime: parseIntSafe(parts[8]),
        close: parseBool(parts[9]),
        oddsType: parseIntSafe(parts[10]),
      };
    }

    if (type === 'handicapHalf') {
      if (len >= 12) {
        return {
          ...base,
          initialHandicap: parts[2],
          initialHome: parts[3],
          initialAway: parts[4],
          instantHandicap: parts[5],
          instantHome: parts[6],
          instantAway: parts[7],
          maintenance: parseBool(parts[8]),
          handicapIndex: parseIntSafe(parts[9]) ?? 1,
          changeTime: parseIntSafe(parts[10]),
          oddsType: parseIntSafe(parts[11]),
        };
      }

      return {
        ...base,
        instantHandicap: parts[2],
        instantHome: parts[3],
        instantAway: parts[4],
        maintenance: parseBool(parts[5]),
        handicapIndex: parseIntSafe(parts[6]) ?? 1,
        changeTime: parseIntSafe(parts[7]),
        oddsType: parseIntSafe(parts[8]),
      };
    }

    if (type === 'europeOdds') {
      if (len >= 12) {
        return {
          ...base,
          initialHome: parts[2],
          initialDraw: parts[3],
          initialAway: parts[4],
          instantHome: parts[5],
          instantDraw: parts[6],
          instantAway: parts[7],
          oddsIndex: parseIntSafe(parts[8]),
          changeTime: parseIntSafe(parts[9]),
          close: parseBool(parts[10]),
          oddsType: parseIntSafe(parts[11]),
        };
      }

      return {
        ...base,
        instantHome: parts[2],
        instantDraw: parts[3],
        instantAway: parts[4],
        oddsIndex: parseIntSafe(parts[5]),
        changeTime: parseIntSafe(parts[6]),
        close: parseBool(parts[7]),
        oddsType: parseIntSafe(parts[8]),
      };
    }

    if (type === 'overUnder') {
      if (len >= 12) {
        return {
          ...base,
          initialHandicap: parts[2],
          initialOver: parts[3],
          initialUnder: parts[4],
          instantHandicap: parts[5],
          instantOver: parts[6],
          instantUnder: parts[7],
          handicapIndex: parseIntSafe(parts[8]) ?? 1,
          changeTime: parseIntSafe(parts[9]),
          close: parseBool(parts[10]),
          oddsType: parseIntSafe(parts[11]),
        };
      }

      return {
        ...base,
        instantHandicap: parts[2],
        instantOver: parts[3],
        instantUnder: parts[4],
        handicapIndex: parseIntSafe(parts[5]) ?? 1,
        changeTime: parseIntSafe(parts[6]),
        close: parseBool(parts[7]),
        oddsType: parseIntSafe(parts[8]),
      };
    }

    if (type === 'overUnderHalf') {
      if (len >= 11) {
        return {
          ...base,
          initialHandicap: parts[2],
          initialOver: parts[3],
          initialUnder: parts[4],
          instantHandicap: parts[5],
          instantOver: parts[6],
          instantUnder: parts[7],
          handicapIndex: parseIntSafe(parts[8]) ?? 1,
          changeTime: parseIntSafe(parts[9]),
          oddsType: parseIntSafe(parts[10]),
        };
      }

      return {
        ...base,
        instantHandicap: parts[2],
        instantOver: parts[3],
        instantUnder: parts[4],
        handicapIndex: parseIntSafe(parts[5]) ?? 1,
        changeTime: parseIntSafe(parts[6]),
        oddsType: parseIntSafe(parts[7]),
      };
    }

    return base;
  });
}

const formatScore = (homeScore?: number, awayScore?: number) => {
  const home = Number.isFinite(homeScore) ? Number(homeScore) : 0;
  const away = Number.isFinite(awayScore) ? Number(awayScore) : 0;
  return `${home}-${away}`;
};

const derivePeriod = (status: number) => {
  if (status === 1) return '滚球';
  if (status === 0) return '未开赛';
  if (status === -1) return '已结束';
  return '';
};

const deriveClock = (match: any) => {
  const minute = match?.extraExplain?.minute ?? match?.minute;
  if (typeof minute === 'number' && minute > 0) {
    return `${minute}'`;
  }
  return '';
};

const resolveStrongSide = (handicap?: string) => {
  if (!handicap) return 'C';
  const parts = handicap.split('/').map((p) => parseFloat(p));
  for (const value of parts) {
    if (!Number.isFinite(value) || value === 0) continue;
    return value > 0 ? 'H' : 'C';
  }
  if (handicap.trim().startsWith('-')) return 'C';
  if (handicap.trim().startsWith('+')) return 'H';
  return 'C';
};

function convertToCrownFormat(match: any, matchOdds: any) {
  // 获取主盘口（handicapIndex = 1）
  const h = matchOdds.handicap?.find((h: any) => h.handicapIndex === 1) || matchOdds.handicap?.[0];
  const e = matchOdds.europeOdds?.find((eo: any) => (eo.oddsIndex ?? 1) === 1) || matchOdds.europeOdds?.[0];
  const o = matchOdds.overUnder?.find((o: any) => o.handicapIndex === 1) || matchOdds.overUnder?.[0];
  const hh = matchOdds.handicapHalf?.find((h: any) => h.handicapIndex === 1) || matchOdds.handicapHalf?.[0];
  const oh = matchOdds.overUnderHalf?.find((o: any) => o.handicapIndex === 1) || matchOdds.overUnderHalf?.[0];

  const timerIso = new Date(match.matchTime * 1000).toISOString();
  const score = formatScore(match.homeScore, match.awayScore);
  const period = derivePeriod(match.status);
  const clock = deriveClock(match);

  const result: any = {
    gid: match.matchId,
    league: match.leagueName,
    league_short_name: match.leagueShortName,
    team_h: match.homeName,
    team_c: match.awayName,
    home: match.homeName,
    away: match.awayName,
    timer: timerIso,
    time: timerIso,
    match_time: timerIso,
    score,
    current_score: score,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homeHalfScore: match.homeHalfScore,
    awayHalfScore: match.awayHalfScore,
    period,
    clock,
    state: match.status, // 添加 state 字段供后端过滤 (status: -1=已结束, 0=未开始, 1=进行中)

    // 让球盘 - 使用后端期望的字段名（主盘口）
    RATIO_RE: h?.instantHandicap || '0',
    IOR_REH: h?.instantHome || '0',
    IOR_REC: h?.instantAway || '0',

    // 独赢盘 - 使用后端期望的字段名（优先从 raw 纠正）
    IOR_RMH: e?.raw ? (e.raw.split(',')[5] || e.instantHome || '0') : (e?.instantHome || '0'),
    IOR_RMN: e?.raw ? (e.raw.split(',')[6] || e.instantDraw || '0') : (e?.instantDraw || '0'),
    IOR_RMC: e?.raw ? (e.raw.split(',')[7] || e.instantAway || '0') : (e?.instantAway || '0'),

    // 大小球 - 使用后端期望的字段名（主盘口）
    RATIO_ROUO: o?.instantHandicap || '0',
    IOR_ROUC: o?.instantOver || '0',
    IOR_ROUH: o?.instantUnder || '0',

    // 半场让球盘 - 使用后端期望的字段名（主盘口）
    RATIO_HRE: hh?.instantHandicap || '0',
    IOR_HREH: hh?.instantHome || '0',
    IOR_HREC: hh?.instantAway || '0',

    // 半场大小球 - 使用后端期望的字段名（主盘口）
    RATIO_HROUO: oh?.instantHandicap || '0',
    IOR_HROUC: oh?.instantOver || '0',
    IOR_HROUH: oh?.instantUnder || '0',

    more: 1,
    strong: resolveStrongSide(h?.instantHandicap),
  };

  // 生成 markets 供前端使用
  const markets: any = { full: {}, half: {} };
  // 独赢
  if (result.IOR_RMH || result.IOR_RMN || result.IOR_RMC) {
    markets.moneyline = { home: result.IOR_RMH, draw: result.IOR_RMN, away: result.IOR_RMC };
    markets.full.moneyline = { ...markets.moneyline };
  }
  // 全场让球（支持多盘口）
  const handicapLines: Array<{ line: string; home: string; away: string }> = [];
  if (result.RATIO_RE || result.IOR_REH || result.IOR_REC) {
    handicapLines.push({ line: result.RATIO_RE, home: result.IOR_REH, away: result.IOR_REC });
  }
  if (result.RATIO_RO || result.IOR_ROH || result.IOR_ROC) {
    handicapLines.push({ line: result.RATIO_RO, home: result.IOR_ROH, away: result.IOR_ROC });
  }
  if (result.RATIO_RCO || result.IOR_RCOH || result.IOR_RCOC) {
    handicapLines.push({ line: result.RATIO_RCO, home: result.IOR_RCOH, away: result.IOR_RCOC });
  }
  if (handicapLines.length > 0) {
    markets.handicap = { ...handicapLines[0] };
    markets.full.handicap = { ...handicapLines[0] };
    markets.full.handicapLines = handicapLines;
  }
  // 全场大小球（支持多盘口）
  const ouLines: Array<{ line: string; over: string; under: string }> = [];
  if (result.RATIO_ROUO || result.IOR_ROUC || result.IOR_ROUH) {
    ouLines.push({ line: result.RATIO_ROUO, over: result.IOR_ROUC, under: result.IOR_ROUH });
  }
  if (result.RATIO_ROUHO || result.IOR_ROUHOC || result.IOR_ROUHOH) {
    ouLines.push({ line: result.RATIO_ROUHO, over: result.IOR_ROUHOC, under: result.IOR_ROUHOH });
  }
  if (result.RATIO_ROUCO || result.IOR_ROUCOC || result.IOR_ROUCOH) {
    ouLines.push({ line: result.RATIO_ROUCO, over: result.IOR_ROUCOC, under: result.IOR_ROUCOH });
  }
  if (ouLines.length > 0) {
    markets.ou = { ...ouLines[0] };
    markets.full.ou = { ...ouLines[0] };
    markets.full.overUnderLines = ouLines;
  }
  // 半场让球
  const halfHandicapLines: Array<{ line: string; home: string; away: string }> = [];
  if (result.RATIO_HRE || result.IOR_HREH || result.IOR_HREC) {
    halfHandicapLines.push({ line: result.RATIO_HRE, home: result.IOR_HREH, away: result.IOR_HREC });
  }
  if (halfHandicapLines.length > 0) {
    markets.half.handicap = { ...halfHandicapLines[0] };
    markets.half.handicapLines = halfHandicapLines;
  }
  // 半场大小球
  const halfOuLines: Array<{ line: string; over: string; under: string }> = [];
  if (result.RATIO_HROUO || result.IOR_HROUC || result.IOR_HROUH) {
    halfOuLines.push({ line: result.RATIO_HROUO, over: result.IOR_HROUC, under: result.IOR_HROUH });
  }
  if (halfOuLines.length > 0) {
    markets.half.ou = { ...halfOuLines[0] };
    markets.half.overUnderLines = halfOuLines;
  }

  result.markets = markets;

  // 添加额外的让球盘口（如果有多个）
  if (matchOdds.handicap && matchOdds.handicap.length > 1) {
    matchOdds.handicap.forEach((handicap: any, index: number) => {
      if (handicap.handicapIndex !== 1) {
        const suffix = handicap.handicapIndex === 2 ? 'O' : handicap.handicapIndex === 3 ? 'CO' : `_${handicap.handicapIndex}`;
        result[`RATIO_R${suffix}`] = handicap.instantHandicap;
        result[`IOR_R${suffix}H`] = handicap.instantHome;
        result[`IOR_R${suffix}C`] = handicap.instantAway;
      }
    });
  }

  // 添加额外的大小球盘口（如果有多个）
  if (matchOdds.overUnder && matchOdds.overUnder.length > 1) {
    matchOdds.overUnder.forEach((ou: any, index: number) => {
      if (ou.handicapIndex !== 1) {
        const suffix = ou.handicapIndex === 2 ? 'HO' : ou.handicapIndex === 3 ? 'CO' : `_${ou.handicapIndex}`;
        result[`RATIO_ROU${suffix}`] = ou.instantHandicap;
        result[`IOR_ROU${suffix}C`] = ou.instantOver;
        result[`IOR_ROU${suffix}H`] = ou.instantUnder;
      }
    });
  }

  return result;
}

function saveData(matches: any[]) {
  const filePath = path.join(DATA_DIR, 'latest-matches.json');
  const data = {
    timestamp: Date.now(),
    matches: matches,
    matchCount: matches.length,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ 已保存 ${matches.length} 场比赛数据`);
}

function updateOddsCache(odds: any) {
  ['handicap', 'europeOdds', 'overUnder', 'handicapHalf', 'overUnderHalf'].forEach((key) => {
    odds[key]?.forEach((item: any) => {
      const matchIdKey = String(item.matchId);
      if (!oddsCache.has(matchIdKey)) {
        oddsCache.set(matchIdKey, {
          handicap: [],
          europeOdds: [],
          overUnder: [],
          handicapHalf: [],
          overUnderHalf: []
        });
      }

      const matchCache = oddsCache.get(matchIdKey);

      if (key === 'europeOdds') {
        // 独赢盘只有一个，合并后替换
        const existing = matchCache[key][0];
        matchCache[key] = [existing ? { ...existing, ...item, matchId: matchIdKey } : { ...item, matchId: matchIdKey }];
      } else if (key === 'handicap' || key === 'overUnder' || key === 'handicapHalf' || key === 'overUnderHalf') {
        // 让球盘和大小球可能有多个，按 handicapIndex 更新
        const existingIndex = matchCache[key].findIndex((existing: any) =>
          existing.handicapIndex === item.handicapIndex
        );

        if (existingIndex >= 0) {
          matchCache[key][existingIndex] = { ...matchCache[key][existingIndex], ...item, matchId: matchIdKey };
        } else {
          matchCache[key].push({ ...item, matchId: matchIdKey });
        }

        // 按 handicapIndex 排序
        matchCache[key].sort((a: any, b: any) => (a.handicapIndex || 1) - (b.handicapIndex || 1));
      }
    });
  });
}

function generateOutput() {
  const convertedMatches = matchesCache
    .map((match) => {
      const matchIdKey = String(match.matchId ?? match.match_id ?? match.gid ?? '');
      return { match, matchIdKey };
    })
    .filter(({ matchIdKey }) => matchIdKey && oddsCache.has(matchIdKey))
    .map(({ match, matchIdKey }) => convertToCrownFormat(match, oddsCache.get(matchIdKey)));
  saveData(convertedMatches);
}

async function fullUpdate() {
  console.log('🔄 开始完整更新...');
  const matches = await fetchSchedule();
  if (matches.length === 0) {
    console.log('⚠️  未获取到比赛数据，跳过本次更新');
    return;
  }
  matchesCache = matches;
  matchesCache = matchesCache.map((match) => ({
    ...match,
    matchId: String(match.matchId ?? match.match_id ?? match.gid ?? ''),
  }));
  console.log(`✅ 获取到 ${matches.length} 场比赛`);

  const oddsData = await fetchMainOdds();
  if (!oddsData) return;

  const odds = {
    handicap: parseOdds(oddsData.handicap || [], 'handicap'),
    europeOdds: parseOdds(oddsData.europeOdds || [], 'europeOdds'),
    overUnder: parseOdds(oddsData.overUnder || [], 'overUnder'),
    handicapHalf: parseOdds(oddsData.handicapHalf || [], 'handicapHalf'),
    overUnderHalf: parseOdds(oddsData.overUnderHalf || [], 'overUnderHalf'),
  };

  console.log(`✅ 获取到皇冠赔率：让球 ${odds.handicap.length}，独赢 ${odds.europeOdds.length}，大小 ${odds.overUnder.length}`);
  updateOddsCache(odds);
  generateOutput();
}

async function changesUpdate() {
  const changesData = await fetchOddsChanges();
  if (!changesData) return;

  const changes = {
    handicap: parseOdds(changesData.handicap || [], 'handicap'),
    europeOdds: parseOdds(changesData.europeOdds || [], 'europeOdds'),
    overUnder: parseOdds(changesData.overUnder || [], 'overUnder'),
    handicapHalf: parseOdds(changesData.handicapHalf || [], 'handicapHalf'),
    overUnderHalf: parseOdds(changesData.overUnderHalf || [], 'overUnderHalf'),
  };

  const total = changes.handicap.length + changes.europeOdds.length + changes.overUnder.length;
  if (total === 0) return;

  console.log(`🔄 赔率变化：让球 ${changes.handicap.length}，独赢 ${changes.europeOdds.length}，大小 ${changes.overUnder.length}`);
  updateOddsCache(changes);
  generateOutput();
}

console.log('============================================================');
console.log('🚀 iSportsAPI 独立抓取服务');
console.log('============================================================');
console.log(`API Key: ${API_KEY}`);
console.log(`数据目录: ${DATA_DIR}`);
console.log(`完整更新间隔: ${FULL_FETCH_INTERVAL / 1000} 秒`);
console.log(`实时更新间隔: ${CHANGES_INTERVAL / 1000} 秒`);
console.log('注意: 抓取所有比赛，由后端根据前端选择的 showtype 过滤');
console.log('⚠️  /schedule/basic 接口限制: 每 60 秒最多 1 次');
console.log('============================================================\n');

fullUpdate();
setInterval(fullUpdate, FULL_FETCH_INTERVAL);
setInterval(changesUpdate, CHANGES_INTERVAL);

// 每 10 分钟打印一次统计
setInterval(() => {
  if (!apiCallStats.limitExceeded) {
    printStats();
  }
}, 600000);
