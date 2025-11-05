import 'dotenv/config';
import axios from 'axios';
import { nameAliasService } from '../src/services/name-alias-service';
import { ISportsLanguageService } from '../src/services/isports-language';

/**
 * 将 iSports 赛事（仅皇冠有赔率的）中的联赛与球队名称导入本地别名库
 * - 默认足球(sport=ft)
 * - 仅保留未结束(status !== -1 && status !== 3)的比赛
 * - 仅保留有皇冠(companyId=3)赔率的比赛
 * - 使用 iSports 语言包 API 获取繁体中文名称
 *
 * 运行示例：
 *   ISPORTS_API_KEY=你的Key npm run aliases:import-isports
 * 可选参数：
 *   --days=30           抓取天数（默认 30 天，从今天开始往后）
 *   --date=YYYY-MM-DD   指定起始日期（UTC），默认今天
 *   --sport=ft|bk       目前仅实现 ft
 */

function getArg(name: string, def?: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return def;
  return arg.split('=')[1];
}

const API_KEY = process.env.ISPORTS_API_KEY || getArg('apiKey') || '';
const sport = (getArg('sport', 'ft') || 'ft').toLowerCase();
const startDate = getArg('date') || new Date().toISOString().split('T')[0];
const days = parseInt(getArg('days', '30') || '30');

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

// 生成日期列表
function generateDateList(start: string, numDays: number): string[] {
  const dates: string[] = [];
  const startDateObj = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < numDays; i++) {
    const date = new Date(startDateObj);
    date.setUTCDate(date.getUTCDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

const normalizeStatus = (value: any): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

async function fetchScheduleByDate(date: string) {
  const params: any = { api_key: API_KEY, date };
  try {
    const res = await axios.get(`${BASE_URL}/schedule/basic`, { params, timeout: 30000 });
    if (res.data?.code !== 0) {
      throw new Error(`iSports /schedule/basic error: ${JSON.stringify(res.data)}`);
    }
    return res.data.data || [];
  } catch (error: any) {
    console.error(`❌ 请求 ${date} 失败:`, error.message);
    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   响应:', JSON.stringify(error.response.data).slice(0, 200));
    }
    return [];
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchCrownOddsPresence(matchIds: string[]): Promise<Set<string>> {
  const present = new Set<string>();
  const batches = chunk(matchIds, 100); // 增加批次大小到 100
  console.log(`   总批次: ${batches.length}，每批 100 场比赛`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      // 显示进度
      if (i % 10 === 0 || i === batches.length - 1) {
        console.log(`   进度: [${i + 1}/${batches.length}] 已查询 ${(i + 1) * 100} 场，找到 ${present.size} 场有皇冠赔率`);
      }

      const res = await axios.get(`${BASE_URL}/odds/all`, {
        params: { api_key: API_KEY, companyId: '3', matchId: batch.join(',') },
        timeout: 15000, // 减少超时时间到 15 秒
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
      console.error(`⚠️  批次 [${i + 1}/${batches.length}] 获取赔率失败:`, error.message);
    }
    // 减少间隔到 500ms
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return present;
}

async function main() {
  console.log('============================================================');
  console.log('🚀 导入 iSports 赛事到本地别名库（仅皇冠）');
  console.log('============================================================');
  console.log(`起始日期: ${startDate}  天数: ${days}  运动: ${sport}`);

  // 1. 初始化语言包服务
  console.log('\n📦 初始化 iSports 语言包服务...');
  const languageService = new ISportsLanguageService(API_KEY, './data');
  await languageService.ensureCache();

  // 2. 生成日期列表
  const dateList = generateDateList(startDate, days);
  console.log(`\n📅 将抓取 ${dateList.length} 天的赛程: ${dateList[0]} ~ ${dateList[dateList.length - 1]}`);

  // 3. 获取所有日期的赛程（英文）
  console.log('\n📥 获取赛程...');
  let allSchedule: any[] = [];
  for (let i = 0; i < dateList.length; i++) {
    const date = dateList[i];
    console.log(`  [${i + 1}/${dateList.length}] ${date}...`);
    const schedule = await fetchScheduleByDate(date);
    allSchedule = allSchedule.concat(schedule);
    // 避免频率限制，每次请求间隔 1 秒
    if (i < dateList.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log(`✅ 共获取 ${allSchedule.length} 场比赛`);

  const schedule = allSchedule;
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

  console.log(`\n📋 候选比赛: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('⚠️  无候选比赛，结束');
    return;
  }

  // 4. 筛选有皇冠赔率的比赛
  console.log('\n👑 筛选有皇冠赔率的比赛（分批查询）...');
  const crownSet = await fetchCrownOddsPresence(candidates.map((c: any) => c.matchId));
  const crownMatches = candidates.filter((c: any) => crownSet.has(c.matchId));
  console.log(`✅ 拥有皇冠赔率的比赛: ${crownMatches.length}`);

  // 5. 收集联赛和球队 ID（去重）
  const leagueIds = new Set<string>();
  const teamIds = new Set<string>();
  const leagueIdToName = new Map<string, string>();
  const teamIdToName = new Map<string, string>();

  crownMatches.forEach((m: any) => {
    if (m.leagueId) {
      leagueIds.add(m.leagueId);
      if (!leagueIdToName.has(m.leagueId)) {
        leagueIdToName.set(m.leagueId, m.leagueName);
      }
    }
    if (m.homeId) {
      teamIds.add(m.homeId);
      if (!teamIdToName.has(m.homeId)) {
        teamIdToName.set(m.homeId, m.homeName);
      }
    }
    if (m.awayId) {
      teamIds.add(m.awayId);
      if (!teamIdToName.has(m.awayId)) {
        teamIdToName.set(m.awayId, m.awayName);
      }
    }
  });

  console.log(`\n🏷️  联赛 ID（去重）: ${leagueIds.size}`);
  console.log(`🏷️  球队 ID（去重）: ${teamIds.size}`);

  // 6. 导入联赛别名（英文 + 繁体）
  console.log('\n📝 导入联赛别名...');
  let leagueOk = 0;
  for (const leagueId of leagueIds) {
    try {
      const nameEn = leagueIdToName.get(leagueId) || '';
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

  // 7. 导入球队别名（英文 + 繁体）
  console.log('\n📝 导入球队别名...');
  let teamOk = 0;
  for (const teamId of teamIds) {
    try {
      const nameEn = teamIdToName.get(teamId) || '';
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
  console.log(`📊 统计：共抓取 ${dateList.length} 天，${allSchedule.length} 场比赛，${crownMatches.length} 场有皇冠赔率`);
  console.log('💡 提示：繁体中文来自 iSports 语言包，英文来自赛程 API');
  console.log('💡 提示：请在页面上手动填写"皇冠简体"字段');
}

main().catch((err) => {
  console.error('❌ 执行失败:', err?.message || err);
  process.exit(1);
});

