/**
 * iSportsAPI 独立抓取服务
 * 
 * 工作原理：
 * 1. 首次启动：获取完整的赛前和滚球赔率数据（/odds/main）
 * 2. 定期完整更新：每 60 秒获取一次完整数据
 * 3. 实时增量更新：每 2 秒获取过去 20 秒内变化的赔率（/odds/main/changes）
 * 4. 合并数据：将变化的赔率更新到缓存中
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = process.env.ISPORTS_API_KEY || 'GvpziueL9ouzIJNj';
const BASE_URL = 'http://api.isportsapi.com/sport/football';
const DATA_DIR = process.env.DATA_DIR || './data';
const FULL_FETCH_INTERVAL = parseInt(process.env.FULL_FETCH_INTERVAL || '60000');
const CHANGES_INTERVAL = parseInt(process.env.CHANGES_INTERVAL || '2000');

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
      return response.data.data;
    } else {
      apiCallStats.errors++;
      console.error('❌ 获取赛程失败:', response.data);
      if (response.data.code === 2) {
        apiCallStats.limitExceeded = true;
        console.error('⚠️  API 调用次数已超出限制！');
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
    const response = await axios.get(`${BASE_URL}/odds/main`, {
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
    const response = await axios.get(`${BASE_URL}/odds/main/changes`, {
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

function parseOdds(data: string[], type: string) {
  return data.map((item) => {
    const parts = item.split(',');
    const base = { matchId: parts[0], companyId: parts[1] };
    
    if (type === 'handicap') {
      return { ...base, instantHandicap: parts[5], instantHome: parts[6], instantAway: parts[7] };
    } else if (type === 'europeOdds') {
      return { ...base, instantHome: parts[5], instantDraw: parts[6], instantAway: parts[7] };
    } else if (type === 'overUnder') {
      return { ...base, instantHandicap: parts[5], instantOver: parts[6], instantUnder: parts[7] };
    }
    return base;
  });
}

function convertToCrownFormat(match: any, matchOdds: any) {
  const h = matchOdds.handicap;
  const e = matchOdds.europeOdds;
  const o = matchOdds.overUnder;
  const hh = matchOdds.handicapHalf;
  const oh = matchOdds.overUnderHalf;

  return {
    gid: match.matchId,
    league: match.leagueName,
    team_h: match.homeName,
    team_c: match.awayName,
    timer: new Date(match.matchTime * 1000).toISOString(),

    // 让球盘 - 使用后端期望的字段名
    RATIO_RE: h?.instantHandicap || '0',
    IOR_REH: h?.instantHome || '0',
    IOR_REC: h?.instantAway || '0',

    // 独赢盘 - 使用后端期望的字段名
    IOR_RMH: e?.instantHome || '0',
    IOR_RMN: e?.instantDraw || '0',
    IOR_RMC: e?.instantAway || '0',

    // 大小球 - 使用后端期望的字段名
    RATIO_ROUO: o?.instantHandicap || '0',
    IOR_ROUC: o?.instantOver || '0',
    IOR_ROUH: o?.instantUnder || '0',

    // 半场让球盘 - 使用后端期望的字段名
    RATIO_HRE: hh?.instantHandicap || '0',
    IOR_HREH: hh?.instantHome || '0',
    IOR_HREC: hh?.instantAway || '0',

    // 半场大小球 - 使用后端期望的字段名
    RATIO_HROUO: oh?.instantHandicap || '0',
    IOR_HROUC: oh?.instantOver || '0',
    IOR_HROUH: oh?.instantUnder || '0',

    more: 1,
    strong: parseFloat(h?.instantHandicap || '0') > 0 ? 'H' : 'C',
  };
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
      if (!oddsCache.has(item.matchId)) oddsCache.set(item.matchId, {});
      oddsCache.get(item.matchId)[key] = item;
    });
  });
}

function generateOutput() {
  const convertedMatches = matchesCache
    .filter((match) => oddsCache.has(match.matchId))
    .map((match) => convertToCrownFormat(match, oddsCache.get(match.matchId)));
  saveData(convertedMatches);
}

async function fullUpdate() {
  console.log('🔄 开始完整更新...');
  const matches = await fetchSchedule();
  if (matches.length === 0) return;
  matchesCache = matches;
  console.log(`✅ 获取到 ${matches.length} 场比赛`);

  const oddsData = await fetchMainOdds();
  if (!oddsData) return;

  const odds = {
    handicap: parseOdds(oddsData.handicap || [], 'handicap'),
    europeOdds: parseOdds(oddsData.europeOdds || [], 'europeOdds'),
    overUnder: parseOdds(oddsData.overUnder || [], 'overUnder'),
    handicapHalf: parseOdds(oddsData.handicapHalf || [], 'handicap'),
    overUnderHalf: parseOdds(oddsData.overUnderHalf || [], 'overUnder'),
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
    handicapHalf: parseOdds(changesData.handicapHalf || [], 'handicap'),
    overUnderHalf: parseOdds(changesData.overUnderHalf || [], 'overUnder'),
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

