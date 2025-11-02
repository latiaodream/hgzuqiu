import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { parseISO, addDays, differenceInMinutes } from 'date-fns';
import { ISportsLanguageService } from '../src/services/isports-language';

interface CrownMatchFile {
  generatedAt: string;
  matches: CrownMatch[];
}

interface CrownMatch {
  crown_gid: string;
  league: string;
  league_id: string;
  home: string;
  away: string;
  datetime: string;
  raw: any;
  source_showtype: string;
}

interface ISportsMatch {
  matchId: string;
  leagueName: string;
  leagueNameTc?: string;  // 繁体中文联赛名称
  leagueId: string;
  matchTime: number;
  status: number;
  homeId: string;
  homeName: string;
  homeNameTc?: string;  // 繁体中文主队名称
  awayId: string;
  awayName: string;
  awayNameTc?: string;  // 繁体中文客队名称
  raw?: any;
}

interface MappingEntry {
  isports_match_id: string;
  crown_gid: string;
  similarity: number;
  time_diff_minutes: number;
  crown: {
    league: string;
    home: string;
    away: string;
    datetime: string;
    source_showtype: string;
  };
  isports: {
    league: string;
    home: string;
    away: string;
    match_time: string;
  };
}

const DEFAULT_CROWN_FILE = path.resolve(process.cwd(), 'crown-gids.json');
const DEFAULT_OUTPUT = path.resolve(process.cwd(), '../fetcher-isports/data/crown-match-map.json');
const ISPORTS_API_BASE = 'http://api.isportsapi.com/sport/football';

function loadCrownMatches(file: string): CrownMatchFile {
  if (!fs.existsSync(file)) {
    throw new Error(`未找到 crown-gids 文件: ${file}`);
  }
  const content = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(content);

  // 过滤掉特殊盘口（Home Team vs Away Team）
  if (data.matches) {
    data.matches = data.matches.filter((m: CrownMatch) => {
      const isSpecial = (m.home === 'Home Team' && m.away === 'Away Team') ||
                       m.league.includes('Specials') ||
                       m.league.includes('Special');
      return !isSpecial;
    });
  }

  return data;
}

async function fetchISportsSchedule(
  apiKey: string,
  date: string,
  languageService?: ISportsLanguageService
): Promise<ISportsMatch[]> {
  const url = `${ISPORTS_API_BASE}/schedule/basic`;
  const response = await axios.get(url, {
    params: { api_key: apiKey, date },
    timeout: 30000,
  });

  if (response.data.code !== 0) {
    throw new Error(`iSports Schedule 接口返回错误: ${JSON.stringify(response.data)}`);
  }

  return (response.data.data || []).map((item: any) => {
    const homeId = String(item.homeId || '');
    const awayId = String(item.awayId || '');
    const leagueId = String(item.leagueId || '');

    return {
      matchId: String(item.matchId),
      leagueName: String(item.leagueName || ''),
      leagueNameTc: languageService?.getLeagueName(leagueId) || undefined,
      leagueId,
      matchTime: Number(item.matchTime) * 1000, // convert to ms
      status: Number(item.status),
      homeId,
      homeName: String(item.homeName || ''),
      homeNameTc: languageService?.getTeamName(homeId) || undefined,
      awayId,
      awayName: String(item.awayName || ''),
      awayNameTc: languageService?.getTeamName(awayId) || undefined,
      raw: item,
    };
  });
}

function normalize(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return 0;

  // 如果一个字符串包含另一个，给予高分（基于较短字符串的长度）
  if (normA.includes(normB)) {
    // normA 包含 normB，说明 normB 是缩写或部分
    return 0.8 + (normB.length / normA.length) * 0.2; // 0.8-1.0
  }
  if (normB.includes(normA)) {
    // normB 包含 normA，说明 normA 是缩写或部分
    return 0.8 + (normA.length / normB.length) * 0.2; // 0.8-1.0
  }

  const longerStr = normA.length > normB.length ? normA : normB;
  const shorterStr = normA.length > normB.length ? normB : normA;

  if (longerStr.length === 0) return 1.0;

  // 编辑距离算法
  const editDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  return (longerStr.length - editDistance(longerStr, shorterStr)) / longerStr.length;
}



function parseCrownDate(datetimeStr: string, reference: Date): Date | null {
  if (!datetimeStr) return null;
  const match = datetimeStr.match(/(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})([ap])/i);
  if (!match) return null;
  const [, monthStr, dayStr, hourStr, minuteStr, ap] = match;
  let month = Number(monthStr) - 1;
  let day = Number(dayStr);
  let hour = Number(hourStr);
  const minute = Number(minuteStr);
  const isPM = ap.toLowerCase() === 'p';

  if (isPM && hour < 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;

  const result = new Date(Date.UTC(reference.getUTCFullYear(), month, day, hour, minute));

  const diff = Math.abs(result.getTime() - reference.getTime());
  const sixMonthsMs = 1000 * 60 * 60 * 24 * 182;
  if (diff > sixMonthsMs) {
    const yearAdjustment = result < reference ? 1 : -1;
    result.setUTCFullYear(result.getUTCFullYear() + yearAdjustment);
  }

  return result;
}

interface MatchContext {
  crown: CrownMatch;
  crownDate: Date | null;
}

function buildMatchContext(crownFile: CrownMatchFile): MatchContext[] {
  const generatedAt = crownFile.generatedAt ? new Date(crownFile.generatedAt) : new Date();
  return crownFile.matches.map((m) => ({
    crown: m,
    crownDate: parseCrownDate(m.datetime, generatedAt),
  }));
}

async function main() {
  const crownFilePath = process.env.CROWN_GID_INPUT || DEFAULT_CROWN_FILE;
  const outputPath = process.env.CROWN_MAP_OUTPUT || DEFAULT_OUTPUT;
  const apiKey = process.env.ISPORTS_API_KEY || process.env.ISPORTS_APIKEY || process.env.ISPORTS_KEY;

  if (!apiKey) {
    console.error('❌ 请在环境变量中设置 ISPORTS_API_KEY');
    process.exit(1);
  }

  // 初始化语言包服务
  console.log('🌐 初始化语言包服务...');
  const languageService = new ISportsLanguageService(apiKey, path.join(__dirname, '..', '..', 'fetcher-isports', 'data'));
  await languageService.ensureCache();
  const stats = languageService.getCacheStats();
  console.log(`✅ 语言包已加载: ${stats.leagues} 联赛, ${stats.teams} 球队`);

  const crownData = loadCrownMatches(crownFilePath);
  const crownContext = buildMatchContext(crownData);

  if (!crownContext.length) {
    console.warn('⚠️ crown-gids 中没有赛事记录，结束');
    process.exit(0);
  }

  const referenceDate = crownData.generatedAt ? new Date(crownData.generatedAt) : new Date();
  const datesToFetch = new Set<string>();
  const baseDateISO = referenceDate.toISOString().slice(0, 10);
  datesToFetch.add(baseDateISO);
  datesToFetch.add(addDays(referenceDate, 1).toISOString().slice(0, 10));
  datesToFetch.add(addDays(referenceDate, -1).toISOString().slice(0, 10));

  const isportsMatches: ISportsMatch[] = [];
  for (const date of datesToFetch) {
    try {
      console.log(`📥 获取 iSports 赛事: ${date}`);
      const matches = await fetchISportsSchedule(apiKey, date, languageService);
      console.log(`   获取到 ${matches.length} 场`);
      isportsMatches.push(...matches);
    } catch (error: any) {
      console.error(`❌ 获取 iSports 赛事失败 (${date}):`, error.message || error);
    }
  }

  if (!isportsMatches.length) {
    console.error('❌ 未获取到任何 iSports 赛事，无法建立映射');
    process.exit(1);
  }

  // 反向匹配：从 iSports 赛事出发，在皇冠中查找最佳匹配
  // 这样可以确保每个 iSports 赛事只匹配一个皇冠 GID
  console.log('🔄 开始匹配（从 iSports → 皇冠）...');
  const matchedEntries: MappingEntry[] = [];
  const unmatchedCrown: MatchContext[] = [];
  const usedCrownGids = new Set<string>();

  for (const isMatch of isportsMatches) {
    let best: { ctx: MatchContext; score: number; timeDiff: number } | null = null;

    for (const ctx of crownContext) {
      // 跳过已经被匹配的皇冠赛事
      if (usedCrownGids.has(ctx.crown.crown_gid)) {
        continue;
      }

      const crownMatch = ctx.crown;
      const crownDate = ctx.crownDate;

      const timeDiffMinutes = crownDate
        ? Math.abs(differenceInMinutes(new Date(isMatch.matchTime), crownDate))
        : 720;
      const timeScore = crownDate ? Math.max(0, 1 - timeDiffMinutes / 240) : 0.2;

      // 优先使用繁体中文名称匹配，如果没有则使用英文
      let leagueScore = 0;
      let homeScore = 0;
      let awayScore = 0;

      // 如果有繁体中文名称，使用繁体中文匹配
      if (isMatch.homeNameTc && isMatch.awayNameTc) {
        homeScore = similarity(crownMatch.home, isMatch.homeNameTc);
        awayScore = similarity(crownMatch.away, isMatch.awayNameTc);
        if (isMatch.leagueNameTc) {
          leagueScore = similarity(crownMatch.league, isMatch.leagueNameTc);
        } else {
          leagueScore = similarity(crownMatch.league, isMatch.leagueName);
        }
      } else {
        // 降级使用英文名称匹配
        homeScore = similarity(crownMatch.home, isMatch.homeName);
        awayScore = similarity(crownMatch.away, isMatch.awayName);
        leagueScore = similarity(crownMatch.league, isMatch.leagueName);
      }

      // 增加球队名称的权重，降低时间和联赛的权重
      const combined =
        timeScore * 0.15 +
        leagueScore * 0.15 +
        homeScore * 0.35 +
        awayScore * 0.35;

      if (!best || combined > best.score) {
        best = { ctx, score: combined, timeDiff: timeDiffMinutes };
      }
    }

    // 降低阈值到 0.45，支持缩写和部分匹配
    if (best && best.score >= 0.45) {
      usedCrownGids.add(best.ctx.crown.crown_gid);
      matchedEntries.push({
        isports_match_id: isMatch.matchId,
        crown_gid: best.ctx.crown.crown_gid,
        similarity: Number(best.score.toFixed(3)),
        time_diff_minutes: best.timeDiff,
        crown: {
          league: best.ctx.crown.league,
          home: best.ctx.crown.home,
          away: best.ctx.crown.away,
          datetime: best.ctx.crown.datetime,
          source_showtype: best.ctx.crown.source_showtype,
        },
        isports: {
          league: isMatch.leagueName,
          home: isMatch.homeName,
          away: isMatch.awayName,
          match_time: new Date(isMatch.matchTime).toISOString(),
        },
      });
    }
  }

  // 找出未匹配的皇冠赛事
  for (const ctx of crownContext) {
    if (!usedCrownGids.has(ctx.crown.crown_gid)) {
      unmatchedCrown.push(ctx);
    }
  }

  matchedEntries.sort((a, b) => b.similarity - a.similarity);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const mappingOutput = {
    generatedAt: new Date().toISOString(),
    crownGeneratedAt: crownData.generatedAt,
    crownMatchCount: crownContext.length,
    isportsMatchCount: isportsMatches.length,
    matchedCount: matchedEntries.length,
    unmatchedCount: unmatchedCrown.length,
    matches: matchedEntries,
    unmatched: unmatchedCrown.slice(0, 50).map((ctx) => ({
      crown_gid: ctx.crown.crown_gid,
      league: ctx.crown.league,
      home: ctx.crown.home,
      away: ctx.crown.away,
      datetime: ctx.crown.datetime,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(mappingOutput, null, 2), 'utf-8');
  console.log(`\n✅ 映射完成，匹配成功 ${matchedEntries.length}/${crownContext.length} 场`);
  console.log(`💾 映射文件已保存到 ${outputPath}`);
  if (unmatchedCrown.length) {
    console.log(`⚠️  尚有 ${unmatchedCrown.length} 场未匹配，可在文件 unmatched 字段查看前 50 条`);
  }
}

main().catch((error) => {
  console.error('❌ 构建映射失败:', error);
  process.exit(1);
});
