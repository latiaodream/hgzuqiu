import 'dotenv/config';
import axios from 'axios';
import { nameAliasService } from '../src/services/name-alias-service';
import { ISportsLanguageService } from '../src/services/isports-language';

/**
 * 将 iSports 今日赛事（仅皇冠有赔率的）中的联赛与球队名称导入本地别名库
 * - 默认足球(sport=ft)
 * - 仅保留未结束(status !== -1 && status !== 3)的比赛
 * - 仅保留有皇冠(companyId=3)赔率的比赛
 * - 使用 iSports 语言包 API 获取繁体中文名称
 *
 * 运行示例：
 *   ISPORTS_API_KEY=你的Key npm run aliases:import-isports
 * 可选参数：
 *   --date=YYYY-MM-DD   指定日期（UTC），默认今天
 *   --sport=ft|bk       目前仅实现 ft
 */

function getArg(name: string, def?: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return def;
  return arg.split('=')[1];
}

const API_KEY = process.env.ISPORTS_API_KEY || getArg('apiKey') || '';
const sport = (getArg('sport', 'ft') || 'ft').toLowerCase();
const date = getArg('date') || new Date().toISOString().split('T')[0];

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
  try {
    const res = await axios.get(`${BASE_URL}/schedule/basic`, { params, timeout: 30000 });
    if (res.data?.code !== 0) {
      throw new Error(`iSports /schedule/basic error: ${JSON.stringify(res.data)}`);
    }
    return res.data.data || [];
  } catch (error: any) {
    console.error('❌ 请求失败:', error.message);
    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   响应:', JSON.stringify(error.response.data).slice(0, 200));
    }
    throw error;
  }
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
    try {
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
    } catch (error: any) {
      console.error(`⚠️  批次获取赔率失败:`, error.message);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return present;
}

async function main() {
  console.log('============================================================');
  console.log('🚀 导入 iSports 今日赛事到本地别名库（仅皇冠）');
  console.log('============================================================');
  console.log(`日期: ${date}  运动: ${sport}`);

  // 1. 初始化语言包服务
  console.log('\n📦 初始化 iSports 语言包服务...');
  const languageService = new ISportsLanguageService(API_KEY, './data');
  await languageService.ensureCache();

  // 2. 获取今日赛程（英文）
  console.log('\n📥 获取今日赛程...');
  const schedule = await fetchTodaySchedule();
  const candidates = schedule
    .filter((m: any) => {
      const status = normalizeStatus(m.status);
      return status !== -1 && status !== 3; // 未开赛或进行中
    })
    .map((m: any) => ({
      matchId: String(m.matchId ?? m.match_id ?? m.gid ?? ''),
      leagueId: String(m.leagueId ?? m.league_id ?? ''),
      leagueName: m.leagueName || m.league || '',
      homeId: String(m.homeId ?? m.home_id ?? ''),
      homeName: m.homeName || m.home || '',
      awayId: String(m.awayId ?? m.away_id ?? ''),
      awayName: m.awayName || m.away || '',
    }))
    .filter((m: any) => m.matchId);

  console.log(`📋 今日候选比赛: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('⚠️  无候选比赛，结束');
    return;
  }

  // 3. 筛选有皇冠赔率的比赛
  console.log('\n👑 筛选有皇冠赔率的比赛...');
  const crownSet = await fetchCrownOddsPresence(candidates.map((c: any) => c.matchId));
  const crownMatches = candidates.filter((c: any) => crownSet.has(c.matchId));
  console.log(`✅ 拥有皇冠赔率的比赛: ${crownMatches.length}`);

  // 4. 收集联赛和球队 ID
  const leagueIds = new Set<string>();
  const teamIds = new Set<string>();
  crownMatches.forEach((m: any) => {
    if (m.leagueId) leagueIds.add(m.leagueId);
    if (m.homeId) teamIds.add(m.homeId);
    if (m.awayId) teamIds.add(m.awayId);
  });

  console.log(`\n🏷️  联赛 ID（去重）: ${leagueIds.size}`);
  console.log(`🏷️  球队 ID（去重）: ${teamIds.size}`);

  // 5. 导入联赛别名（英文 + 繁体）
  console.log('\n📝 导入联赛别名...');
  let leagueOk = 0;
  for (const leagueId of leagueIds) {
    try {
      const match = crownMatches.find((m: any) => m.leagueId === leagueId);
      const nameEn = match?.leagueName || '';
      const nameZhTw = languageService.getLeagueName(leagueId) || '';

      if (!nameEn && !nameZhTw) {
        console.warn(`⚠️  联赛 ${leagueId} 无英文和繁体名称，跳过`);
        continue;
      }

      await nameAliasService.createLeagueAlias({
        nameEn: nameEn || undefined,
        nameZhTw: nameZhTw || undefined,
        aliases: [],
      });
      leagueOk++;
    } catch (e: any) {
      console.error(`⚠️  联赛 ${leagueId} 导入失败:`, e?.message || e);
    }
  }

  // 6. 导入球队别名（英文 + 繁体）
  console.log('\n📝 导入球队别名...');
  let teamOk = 0;
  for (const teamId of teamIds) {
    try {
      const match = crownMatches.find((m: any) => m.homeId === teamId || m.awayId === teamId);
      const nameEn = match?.homeId === teamId ? match.homeName : match?.awayName || '';
      const nameZhTw = languageService.getTeamName(teamId) || '';

      if (!nameEn && !nameZhTw) {
        console.warn(`⚠️  球队 ${teamId} 无英文和繁体名称，跳过`);
        continue;
      }

      await nameAliasService.createTeamAlias({
        nameEn: nameEn || undefined,
        nameZhTw: nameZhTw || undefined,
        aliases: [],
      });
      teamOk++;
    } catch (e: any) {
      console.error(`⚠️  球队 ${teamId} 导入失败:`, e?.message || e);
    }
  }

  console.log('\n============================================================');
  console.log(`✅ 导入完成：联赛 ${leagueOk}/${leagueIds.size}，球队 ${teamOk}/${teamIds.size}`);
  console.log('💡 提示：繁体中文来自 iSports 语言包，英文来自赛程 API');
  console.log('💡 提示：请在页面上手动填写"皇冠简体"字段');
}

main().catch((err) => {
  console.error('❌ 执行失败:', err?.message || err);
  process.exit(1);
});

