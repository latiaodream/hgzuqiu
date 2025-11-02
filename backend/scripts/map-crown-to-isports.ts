import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pinyin } from 'pinyin-pro';
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
  leagueId: string;
  matchTime: number;
  status: number;
  homeId: string;
  homeName: string;
  homeNameTc?: string; // 繁体中文名称
  homeNameCn?: string; // 简体中文名称
  awayId: string;
  awayName: string;
  awayNameTc?: string; // 繁体中文名称
  awayNameCn?: string; // 简体中文名称
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
  return JSON.parse(content);
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

    // 获取繁体中文名称和简体中文名称
    const homeNameTc = languageService?.getTeamName(homeId);
    const homeNameCn = languageService?.getTeamNameSimplified(homeId);
    const awayNameTc = languageService?.getTeamName(awayId);
    const awayNameCn = languageService?.getTeamNameSimplified(awayId);

    return {
      matchId: String(item.matchId),
      leagueName: String(item.leagueName || ''),
      leagueId: String(item.leagueId || ''),
      matchTime: Number(item.matchTime) * 1000, // convert to ms
      status: Number(item.status),
      homeId,
      homeName: String(item.homeName || ''),
      homeNameTc,
      homeNameCn,
      awayId,
      awayName: String(item.awayName || ''),
      awayNameTc,
      awayNameCn,
      raw: item,
    };
  });
}

function normalize(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function toPinyin(str: string): string {
  if (!str) return '';
  return pinyin(str, { toneType: 'none', type: 'array', v: true }).join('');
}

function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return 0;
  const maxLen = Math.max(normA.length, normB.length);
  let matches = 0;
  const minLen = Math.min(normA.length, normB.length);

  for (let i = 0; i < minLen; i++) {
    if (normA[i] === normB[i]) {
      matches += 1;
    }
  }

  return matches / maxLen;
}

function similarityWithPinyin(
  chinese: string,
  english: string,
  chineseTc?: string,
  chineseCn?: string
): number {
  const pinyinValue = toPinyin(chinese);
  const score1 = similarity(pinyinValue, english);
  const score2 = similarity(chinese, english);

  // 如果有繁体中文名称，也计算相似度
  let score3 = 0;
  if (chineseTc) {
    score3 = similarity(chinese, chineseTc);
  }

  // 如果有简体中文名称，也计算相似度（优先级最高）
  let score4 = 0;
  if (chineseCn) {
    score4 = similarity(chinese, chineseCn);
  }

  return Math.max(score1, score2, score3, score4);
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

  const matchedEntries: MappingEntry[] = [];
  const unmatched: MatchContext[] = [];

  for (const ctx of crownContext) {
    const crownMatch = ctx.crown;
    const crownDate = ctx.crownDate;
    let best: { match: ISportsMatch; score: number; timeDiff: number } | null = null;

    for (const isMatch of isportsMatches) {
      const timeDiffMinutes = crownDate
        ? Math.abs(differenceInMinutes(new Date(isMatch.matchTime), crownDate))
        : 720;
      const timeScore = crownDate ? Math.max(0, 1 - timeDiffMinutes / 240) : 0.2;

      const leagueScore = similarityWithPinyin(crownMatch.league, isMatch.leagueName);

      // 使用简体中文名称提高匹配准确度（优先级最高）
      const homeScore = similarityWithPinyin(
        crownMatch.home,
        isMatch.homeName,
        isMatch.homeNameTc,
        isMatch.homeNameCn
      );
      const awayScore = similarityWithPinyin(
        crownMatch.away,
        isMatch.awayName,
        isMatch.awayNameTc,
        isMatch.awayNameCn
      );

      const combined =
        timeScore * 0.2 +
        leagueScore * 0.2 +
        homeScore * 0.3 +
        awayScore * 0.3;

      if (!best || combined > best.score) {
        best = { match: isMatch, score: combined, timeDiff: timeDiffMinutes };
      }
    }

    if (best && best.score >= 0.55) {
      matchedEntries.push({
        isports_match_id: best.match.matchId,
        crown_gid: crownMatch.crown_gid,
        similarity: Number(best.score.toFixed(3)),
        time_diff_minutes: best.timeDiff,
        crown: {
          league: crownMatch.league,
          home: crownMatch.home,
          away: crownMatch.away,
          datetime: crownMatch.datetime,
          source_showtype: crownMatch.source_showtype,
        },
        isports: {
          league: best.match.leagueName,
          home: best.match.homeName,
          away: best.match.awayName,
          match_time: new Date(best.match.matchTime).toISOString(),
        },
      });
    } else {
      unmatched.push(ctx);
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
    unmatchedCount: unmatched.length,
    matches: matchedEntries,
    unmatched: unmatched.slice(0, 50).map((ctx) => ({
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
  if (unmatched.length) {
    console.log(`⚠️  尚有 ${unmatched.length} 场未匹配，可在文件 unmatched 字段查看前 50 条`);
  }
}

main().catch((error) => {
  console.error('❌ 构建映射失败:', error);
  process.exit(1);
});
