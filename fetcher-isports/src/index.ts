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
const CROWN_MAP_PATH = path.join(DATA_DIR, 'crown-match-map.json');
// 设置为 60 秒（60000ms），符合 /schedule/basic 接口的 "每 60 秒最多 1 次" 限制
const FULL_FETCH_INTERVAL = parseInt(process.env.FULL_FETCH_INTERVAL || '60000');
const CHANGES_INTERVAL = parseInt(process.env.CHANGES_INTERVAL || '2000');
const USE_ALL_ODDS = true; // 使用 /odds/all 端点获取多个盘口

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let matchesCache: any[] = [];
let oddsCache: Map<string, any> = new Map();
let crownMatchMap: Map<string, string> = new Map();
let crownMatchDetails: Map<string, any> = new Map();
const missingOddsAttempts: Map<string, number> = new Map();
const MISSING_ODDS_RETRY_INTERVAL = 15000;
const MAX_LIVE_FETCH_BATCH = 20;

function loadCrownMatchMap() {
  try {
    if (!fs.existsSync(CROWN_MAP_PATH)) {
      console.log('ℹ️  未找到 crown-match-map.json，下注将使用 iSports 比赛 ID');
      crownMatchMap = new Map();
      return;
    }
    const raw = fs.readFileSync(CROWN_MAP_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const entries = parsed?.matches || [];
    crownMatchMap = new Map();
    crownMatchDetails = new Map();
    entries.forEach((entry: any) => {
      const matchId = String(entry.isports_match_id);
      const crownGid = String(entry.crown_gid);
      crownMatchMap.set(matchId, crownGid);
      crownMatchDetails.set(matchId, entry);
    });
    console.log(`ℹ️  已加载 ${crownMatchMap.size} 条皇冠映射`);
  } catch (error: any) {
    console.error('⚠️  读取 crown-match-map.json 失败:', error.message);
    crownMatchMap = new Map();
    crownMatchDetails = new Map();
  }
}

loadCrownMatchMap();

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
async function fetchScheduleByDate(date: string, countStats: boolean) {
  if (countStats) {
    apiCallStats.schedule++;
  }
  try {
    const response = await axios.get(`${BASE_URL}/schedule/basic`, {
      params: { api_key: API_KEY, date },
      timeout: 30000,
    });

    if (response.data.code === 0) {
      const allMatches = response.data.data || [];

      // 统计各状态比赛数量
      const liveCount = allMatches.filter((m: any) => m.status === 1).length;
      const earlyCount = allMatches.filter((m: any) => m.status === 0).length;
      const finishedCount = allMatches.filter((m: any) => m.status === -1).length;

      console.log(`📊 赛程(${date}): 总数 ${allMatches.length} (滚球 ${liveCount}, 早盘 ${earlyCount}, 已结束 ${finishedCount})`);
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

async function fetchSchedule() {
  checkAndResetStats();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const dates = [
    { value: todayStr, label: '今日' },
    { value: yesterdayStr, label: '昨日' },
  ];

  const seenMatches: Map<string, any> = new Map();

  for (const [index, dateInfo] of dates.entries()) {
    const matches = await fetchScheduleByDate(dateInfo.value, true);
    for (const match of matches) {
      const key = String(match.matchId ?? match.match_id ?? match.gid ?? '');
      if (!key) continue;

      if (!seenMatches.has(key)) {
        seenMatches.set(key, match);
      } else {
        // 如果已存在，优先保留状态更实时的数据（滚球 > 未开赛 > 已结束）
        const existing = seenMatches.get(key);
        const existingStatus = normalizeStatus(existing.status);
        const newStatus = normalizeStatus(match.status);
        if (newStatus > existingStatus) {
          seenMatches.set(key, match);
        } else if (newStatus === existingStatus) {
          // 如果状态相同，使用较新的 matchTime
          const existingTime = existing.matchTime ?? existing.match_time ?? 0;
          const newTime = match.matchTime ?? match.match_time ?? 0;
          if (newTime > existingTime) {
            seenMatches.set(key, match);
          }
        }
      }
    }
  }

  const combinedMatches = Array.from(seenMatches.values());

  const liveCount = combinedMatches.filter((m: any) => normalizeStatus(m.status) === 1).length;
  const earlyCount = combinedMatches.filter((m: any) => normalizeStatus(m.status) === 0).length;
  const finishedCount = combinedMatches.filter((m: any) => normalizeStatus(m.status) === -1).length;

  console.log(`📊 合并赛程: 总数 ${combinedMatches.length} (滚球 ${liveCount}, 早盘 ${earlyCount}, 已结束 ${finishedCount})`);

  return combinedMatches;
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
const normalizeStatus = (value: any) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return 0;
    const parsed = parseInt(trimmed, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};
const hasNonZeroNumber = (value?: string) => {
  if (value === undefined || value === null) return false;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return false;
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    return parsed !== 0;
  }
  return true;
};
const hasOddsData = (entry: any) => {
  if (!entry) return false;
  return ['handicap', 'europeOdds', 'overUnder', 'handicapHalf', 'overUnderHalf'].some(
    (key) => Array.isArray(entry[key]) && entry[key].length > 0
  );
};
const preferName = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
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
          inPlay: parseBool(parts[9]),
          handicapIndex: parseIntSafe(parts[10]) ?? 1,
          handicapCount: parseIntSafe(parts[11]) ?? 1,
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

function convertToCrownFormat(match: any, matchOdds: any, crownGid?: string) {
  const odds = matchOdds ?? {
    handicap: [],
    europeOdds: [],
    overUnder: [],
    handicapHalf: [],
    overUnderHalf: [],
  };

  const timerIso = new Date(match.matchTime * 1000).toISOString();
  const score = formatScore(match.homeScore, match.awayScore);
  const period = derivePeriod(match.status);
  const clock = deriveClock(match);

  const mapLines = (items: any[] | undefined, valueKeys: { line: string; home?: string; away?: string; over?: string; under?: string }) => {
    if (!items) return [];
    return items
      .map((item) => ({
        line: item[valueKeys.line] ?? item.instantHandicap ?? item.initialHandicap ?? '0',
        home: valueKeys.home ? item[valueKeys.home] ?? '0' : undefined,
        away: valueKeys.away ? item[valueKeys.away] ?? '0' : undefined,
        over: valueKeys.over ? item[valueKeys.over] ?? '0' : undefined,
        under: valueKeys.under ? item[valueKeys.under] ?? '0' : undefined,
        index: item.handicapIndex ?? item.oddsIndex ?? 1,
      }))
      .sort((a, b) => (a.index || 1) - (b.index || 1));
  };

  const handicapLines = mapLines(odds.handicap, { line: 'instantHandicap', home: 'instantHome', away: 'instantAway' });
  const overUnderLines = mapLines(odds.overUnder, { line: 'instantHandicap', over: 'instantOver', under: 'instantUnder' });
  const halfHandicapLines = mapLines(odds.handicapHalf, { line: 'instantHandicap', home: 'instantHome', away: 'instantAway' });
  const halfOverUnderLines = mapLines(odds.overUnderHalf, { line: 'instantHandicap', over: 'instantOver', under: 'instantUnder' });
  const mainHandicap = handicapLines[0];
  const mainOverUnder = overUnderLines[0];
  const mainHalfHandicap = halfHandicapLines[0];
  const mainHalfOverUnder = halfOverUnderLines[0];
  const mainEurope = odds.europeOdds?.find((eo: any) => (eo.oddsIndex ?? 1) === 1) || odds.europeOdds?.[0];

  const hasHandicapOdds = handicapLines.some((line) => hasNonZeroNumber(line.home) || hasNonZeroNumber(line.away));
  const hasOverUnderOdds = overUnderLines.some((line) => hasNonZeroNumber(line.over) || hasNonZeroNumber(line.under));
  const hasHalfHandicapOdds = halfHandicapLines.some((line) => hasNonZeroNumber(line.home) || hasNonZeroNumber(line.away));
  const hasHalfOverUnderOdds = halfOverUnderLines.some((line) => hasNonZeroNumber(line.over) || hasNonZeroNumber(line.under));
  const hasEuropeOdds = !!mainEurope && (hasNonZeroNumber(mainEurope.instantHome) || hasNonZeroNumber(mainEurope.instantAway) || hasNonZeroNumber(mainEurope.instantDraw));

  const hasAnyOdds = hasHandicapOdds || hasOverUnderOdds || hasHalfHandicapOdds || hasHalfOverUnderOdds || hasEuropeOdds;

  if (!hasAnyOdds) {
    return null;
  }

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
    state: match.status,
    crown_gid: crownGid,

    RATIO_RE: mainHandicap?.line || '0',
    IOR_REH: mainHandicap?.home || '0',
    IOR_REC: mainHandicap?.away || '0',

    IOR_RMH: mainEurope?.instantHome || '0',
    IOR_RMN: mainEurope?.instantDraw || '0',
    IOR_RMC: mainEurope?.instantAway || '0',

    RATIO_ROUO: mainOverUnder?.line || '0',
    IOR_ROUC: mainOverUnder?.over || '0',
    IOR_ROUH: mainOverUnder?.under || '0',

    RATIO_HRE: mainHalfHandicap?.line || '0',
    IOR_HREH: mainHalfHandicap?.home || '0',
    IOR_HREC: mainHalfHandicap?.away || '0',

    RATIO_HROUO: mainHalfOverUnder?.line || '0',
    IOR_HROUC: mainHalfOverUnder?.over || '0',
    IOR_HROUH: mainHalfOverUnder?.under || '0',

    more: handicapLines.length > 1 || overUnderLines.length > 1 ? 1 : 0,
    strong: resolveStrongSide(mainHandicap?.line),
  };

  handicapLines.forEach((line, idx) => {
    const index = line.index ?? idx + 1;
    if (index === 1) return;
    const suffix = index === 2 ? 'O' : index === 3 ? 'CO' : `_${index}`;
    result[`RATIO_R${suffix}`] = line.line;
    result[`IOR_R${suffix}H`] = line.home;
    result[`IOR_R${suffix}C`] = line.away;
  });

  overUnderLines.forEach((line, idx) => {
    const index = line.index ?? idx + 1;
    if (index === 1) return;
    const suffix = index === 2 ? 'HO' : index === 3 ? 'CO' : `_${index}`;
    result[`RATIO_ROU${suffix}`] = line.line;
    result[`IOR_ROU${suffix}C`] = line.over;
    result[`IOR_ROU${suffix}H`] = line.under;
  });

  halfHandicapLines.forEach((line, idx) => {
    const index = line.index ?? idx + 1;
    if (index === 1) return;
    const suffix = index === 2 ? 'O' : index === 3 ? 'CO' : `_${index}`;
    result[`RATIO_HR${suffix}`] = line.line;
    result[`IOR_HR${suffix}H`] = line.home;
    result[`IOR_HR${suffix}C`] = line.away;
  });

  halfOverUnderLines.forEach((line, idx) => {
    const index = line.index ?? idx + 1;
    if (index === 1) return;
    const suffix = index === 2 ? 'HO' : index === 3 ? 'CO' : `_${index}`;
    result[`RATIO_HROU${suffix}`] = line.line;
    result[`IOR_HROU${suffix}C`] = line.over;
    result[`IOR_HROU${suffix}H`] = line.under;
  });

  const markets: any = {
    full: {
      handicapLines: handicapLines.map((line) => ({ line: line.line, home: line.home || '0', away: line.away || '0' })),
      overUnderLines: overUnderLines.map((line) => ({ line: line.line, over: line.over || '0', under: line.under || '0' })),
    },
    half: {
      handicapLines: halfHandicapLines.map((line) => ({ line: line.line, home: line.home || '0', away: line.away || '0' })),
      overUnderLines: halfOverUnderLines.map((line) => ({ line: line.line, over: line.over || '0', under: line.under || '0' })),
    }
  };

  if (result.IOR_RMH || result.IOR_RMN || result.IOR_RMC) {
    markets.moneyline = { home: result.IOR_RMH, draw: result.IOR_RMN, away: result.IOR_RMC };
    markets.full.moneyline = { ...markets.moneyline };
  }

  if (markets.full.handicapLines.length) {
    markets.handicap = { ...markets.full.handicapLines[0] };
    markets.full.handicap = { ...markets.full.handicapLines[0] };
  }

  if (markets.full.overUnderLines.length) {
    markets.ou = { ...markets.full.overUnderLines[0] };
    markets.full.ou = { ...markets.full.overUnderLines[0] };
  }

  if (markets.half.handicapLines.length) {
    markets.half.handicap = { ...markets.half.handicapLines[0] };
  }

  if (markets.half.overUnderLines.length) {
    markets.half.ou = { ...markets.half.overUnderLines[0] };
  }

  result.markets = markets;
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
    .filter(({ matchIdKey }) => matchIdKey)
    .map(({ match, matchIdKey }) => {
      const mapping = crownMatchDetails.get(matchIdKey);
      const isportsInfo = mapping?.isports;
      if (isportsInfo) {
        const leagueName = preferName(isportsInfo.league_cn, isportsInfo.league_tc, isportsInfo.league, match.leagueName, match.league);
        const homeName = preferName(isportsInfo.home_cn, isportsInfo.home_tc, isportsInfo.home, match.homeName, match.home);
        const awayName = preferName(isportsInfo.away_cn, isportsInfo.away_tc, isportsInfo.away, match.awayName, match.away);

        if (leagueName) {
          match.leagueName = leagueName;
          match.leagueShortName = leagueName;
          match.league = leagueName;
        }
        if (homeName) {
          match.homeName = homeName;
          match.home = homeName;
          match.team_h = homeName;
        }
        if (awayName) {
          match.awayName = awayName;
          match.away = awayName;
          match.team_c = awayName;
        }
      }

      const odds = oddsCache.get(matchIdKey);
      const status = normalizeStatus(match.status ?? match.state);
      if (!odds && status !== 1) {
        return null;
      }
      const converted = convertToCrownFormat(
        match,
        odds ?? {
          handicap: [],
          europeOdds: [],
          overUnder: [],
          handicapHalf: [],
          overUnderHalf: []
        },
        crownMatchMap.get(matchIdKey)
      );
      return converted;
    })
    .filter((match): match is any => match !== null);
  saveData(convertedMatches);
}

async function ensureLiveOdds() {
  if (matchesCache.length === 0) return false;

  const now = Date.now();
  const liveMatches = matchesCache.filter(
    (match) => normalizeStatus(match.status ?? match.state) === 1
  );

  if (liveMatches.length === 0) return false;

  const candidates: string[] = [];

  for (const match of liveMatches) {
    const matchId = String(match.matchId ?? match.match_id ?? match.gid ?? '').trim();
    if (!matchId) continue;

    const cached = oddsCache.get(matchId);
    if (hasOddsData(cached)) {
      missingOddsAttempts.delete(matchId);
      continue;
    }

    const lastAttempt = missingOddsAttempts.get(matchId) || 0;
    if (now - lastAttempt < MISSING_ODDS_RETRY_INTERVAL) {
      continue;
    }

    missingOddsAttempts.set(matchId, now);
    candidates.push(matchId);

    if (candidates.length >= MAX_LIVE_FETCH_BATCH) {
      break;
    }
  }

  if (candidates.length === 0) return false;

  try {
    const response = await axios.get(`${BASE_URL}/odds/all`, {
      params: { api_key: API_KEY, companyId: '3', matchId: candidates.join(',') },
      timeout: 30000,
    });

    if (response.data.code === 0) {
      const oddsData = response.data.data || {};
      const odds = {
        handicap: parseOdds(oddsData.handicap || [], 'handicap'),
        europeOdds: parseOdds(oddsData.europeOdds || [], 'europeOdds'),
        overUnder: parseOdds(oddsData.overUnder || [], 'overUnder'),
        handicapHalf: parseOdds(oddsData.handicapHalf || [], 'handicapHalf'),
        overUnderHalf: parseOdds(oddsData.overUnderHalf || [], 'overUnderHalf'),
      };

      updateOddsCache(odds);

      let updatedMatches = 0;
      for (const matchId of candidates) {
        const cacheEntry = oddsCache.get(matchId);
        if (hasOddsData(cacheEntry)) {
          missingOddsAttempts.delete(matchId);
          updatedMatches++;
        }
      }

      if (updatedMatches > 0) {
        console.log(`✅ 补充滚球赔率成功: ${updatedMatches}/${candidates.length} 场`);
        return true;
      }

      console.log(`⚠️ 补充滚球赔率无数据返回 (${candidates.length} 场)`);
      return false;
    }

    console.warn('⚠️ 补充滚球赔率失败:', response.data);
  } catch (error: any) {
    console.error('❌ 补充滚球赔率请求失败:', error.message);
  }

  return false;
}

async function fullUpdate() {
  loadCrownMatchMap();
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
    crown_gid: crownMatchMap.get(String(match.matchId ?? match.match_id ?? match.gid ?? '')),
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
  await ensureLiveOdds();
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
  await ensureLiveOdds();
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
