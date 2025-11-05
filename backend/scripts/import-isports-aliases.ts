import 'dotenv/config';
import axios from 'axios';
import { nameAliasService } from '../src/services/name-alias-service';

/**
 * 将 iSports 今日赛事（仅皇冠有赔率的）中的联赛与球队名称导入本地别名库
 * - 默认足球(sport=ft)，简体中文(lang=zh-cn)
 * - 仅保留未结束(status !== -1 && status !== 3)的比赛
 * - 仅保留有皇冠(companyId=3)赔率的比赛
 *
 * 运行示例：
 *   ISPORTS_API_KEY=你的Key npm run aliases:import-isports
 * 可选参数：
 *   --date=YYYY-MM-DD   指定日期（UTC），默认今天
 *   --sport=ft|bk       目前仅实现 ft
 *   --lang=zh-cn        语言，默认 zh-cn
 */

function getArg(name: string, def?: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return def;
  return arg.split('=')[1];
}

const API_KEY = process.env.ISPORTS_API_KEY || getArg('apiKey') || '';
const sport = (getArg('sport', 'ft') || 'ft').toLowerCase();
const date = getArg('date') || new Date().toISOString().split('T')[0];
const lang = getArg('lang', 'zh-cn') || 'zh-cn';

if (!API_KEY) {
  console.error('❌ 缺少 ISPORTS_API_KEY（或 --apiKey）');
  process.exit(1);
}

if (sport !== 'ft') {
  console.warn('⚠️  当前脚本仅实现足球(ft)，其它运动暂未实现');
}

const BASE_URL = sport === 'bk'
  ? 'http://api.isportsapi.com/sport/basketball'
  : 'http://api.isportsapi.com/sport/football';

const normalizeStatus = (value: any): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

async function fetchTodaySchedule() {
  const params: any = { api_key: API_KEY, date };
  if (lang) params.lang = lang;
  const res = await axios.get(`${BASE_URL}/schedule/basic`, { params, timeout: 30000 });
  if (res.data?.code !== 0) {
    throw new Error(`iSports /schedule/basic error: ${JSON.stringify(res.data)}`);
  }
  return res.data.data || [];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchCrownOddsPresence(matchIds: string[]): Promise<Set<string>> {
  const present = new Set<string>();
  const batches = chunk(matchIds, 50);
  for (const batch of batches) {
    const res = await axios.get(`${BASE_URL}/odds/all`, {
      params: { api_key: API_KEY, companyId: '3', matchId: batch.join(',') },
      timeout: 30000,
    });
    if (res.data?.code !== 0) continue;
    const d = res.data?.data || {};
    const add = (rows?: string[]) => {
      (rows || []).forEach((row) => {
        const parts = String(row).split(',');
        const matchId = parts[0];
        if (matchId) present.add(String(matchId));
      });
    };
    add(d.handicap);
    add(d.europeOdds);
    add(d.overUnder);
    add(d.handicapHalf);
    add(d.overUnderHalf);
  }
  return present;
}

async function main() {
  console.log('============================================================');
  console.log('🚀 导入 iSports 今日赛事到本地别名库（仅皇冠）');
  console.log('============================================================');
  console.log(`日期: ${date}  语言: ${lang}  运动: ${sport}`);

  const schedule = await fetchTodaySchedule();
  const candidates = schedule
    .filter((m: any) => {
      const status = normalizeStatus(m.status);
      return status !== -1 && status !== 3; // 未开赛或进行中
    })
    .map((m: any) => ({
      matchId: String(m.matchId ?? m.match_id ?? m.gid ?? ''),
      league: m.leagueName || m.league || '',
      home: m.homeName || m.home || '',
      away: m.awayName || m.away || '',
    }))
    .filter((m: any) => m.matchId);

  console.log(`📋 今日候选比赛: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('⚠️  无候选比赛，结束');
    return;
  }

  const crownSet = await fetchCrownOddsPresence(candidates.map((c: any) => c.matchId));
  const crownMatches = candidates.filter((c: any) => crownSet.has(c.matchId));
  console.log(`👑 拥有皇冠赔率的比赛: ${crownMatches.length}`);

  const leagueSet = new Set<string>();
  const teamSet = new Set<string>();
  crownMatches.forEach((m: any) => {
    if (m.league && m.league.trim()) leagueSet.add(m.league.trim());
    if (m.home && m.home.trim()) teamSet.add(m.home.trim());
    if (m.away && m.away.trim()) teamSet.add(m.away.trim());
  });

  console.log(`🏷️  联赛（去重）: ${leagueSet.size}`);
  console.log(`🏷️  球队（去重）: ${teamSet.size}`);

  // 逐条 upsert 到别名库
  let leagueOk = 0, teamOk = 0;
  for (const name of leagueSet) {
    try {
      await nameAliasService.createLeagueAlias({ nameZhCn: name, aliases: [] });
      leagueOk++;
    } catch (e: any) {
      console.error('⚠️  联赛导入失败:', name, e?.message || e);
    }
  }
  for (const name of teamSet) {
    try {
      await nameAliasService.createTeamAlias({ nameZhCn: name, aliases: [] });
      teamOk++;
    } catch (e: any) {
      console.error('⚠️  球队导入失败:', name, e?.message || e);
    }
  }

  console.log('============================================================');
  console.log(`✅ 导入完成：联赛 ${leagueOk}/${leagueSet.size}，球队 ${teamOk}/${teamSet.size}`);
}

main().catch((err) => {
  console.error('❌ 执行失败:', err?.message || err);
  process.exit(1);
});

