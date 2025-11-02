import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { parseISO, addDays, differenceInMinutes } from 'date-fns';
import { pinyin } from 'pinyin-pro';

interface CrownMatchFile {
  generatedAt: string;
  matchCount: number;
  matches: CrownMatch[];
}

interface CrownMatch {
  crown_gid: string;
  league: string;
  home: string;
  away: string;
  datetime: string;
  source_showtype?: string;
}

interface ISportsMatch {
  matchId: string;
  leagueName: string;
  leagueId: string;
  matchTime: number;
  status: number;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
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
    source_showtype?: string;
  };
  isports: {
    league: string;
    home: string;
    away: string;
    match_time: string;
  };
}

interface MatchContext {
  crown: CrownMatch;
  crownDate: Date | null;
}

// 常见球队别名映射
const TEAM_ALIASES: Record<string, string[]> = {
  // 英文球队
  'manchester united': ['man united', 'man utd', 'mufc'],
  'manchester city': ['man city', 'mcfc'],
  'tottenham': ['tottenham hotspur', 'spurs'],
  'newcastle': ['newcastle united'],
  'west ham': ['west ham united'],
  'brighton': ['brighton hove albion'],
  'nottingham forest': ['nott forest', 'notts forest'],
  'psv': ['psv eindhoven'],
  'hertha bsc': ['hertha berlin'],
  'bayern': ['bayern munich', 'fc bayern'],
  'borussia dortmund': ['bvb', 'dortmund'],
  'inter': ['inter milan', 'internazionale'],
  'ac milan': ['milan'],
  'atletico madrid': ['atletico', 'atm'],
  'athletic bilbao': ['athletic club'],
  'real sociedad': ['sociedad'],
  'paris saint germain': ['psg', 'paris sg'],
  'olympique marseille': ['marseille', 'om'],
  'olympique lyon': ['lyon', 'ol'],

  // 中文球队（繁体 → 拼音/英文）
  '青島海牛': ['qingdao hainiu', 'qingdao'],
  '武漢三鎮': ['wuhan three towns', 'wuhan'],
  '水原': ['suwon'],
  '大邱': ['daegu'],
  '忠南牙山': ['chungnam asan'],
  '天安城': ['cheonan city'],
  '北區': ['northern district'],
  '南區足球會': ['southern district'],
};

// 需要移除的无效词
const REMOVE_WORDS = [
  'fc', 'cf', 'sc', 'ac', 'as', 'cd', 'rcd', 'ud', 'sd',
  'u23', 'u21', 'u19', 'u18',
  'football club', 'soccer club', 'sporting club',
  'club', 'united', 'city', 'town', 'athletic',
  'reserves', 'ii', 'iii', 'b', 'c',
];

const DEFAULT_CROWN_FILE = path.resolve(process.cwd(), 'crown-gids.json');
const DEFAULT_OUTPUT = path.resolve(process.cwd(), '../fetcher-isports/data/crown-match-map.json');
const ISPORTS_API_BASE = 'http://api.isportsapi.com/sport/football';

/**
 * 标准化球队/联赛名称
 */
function normalizeTeamName(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // 检查是否包含中文字符
  const hasChinese = /[\u4e00-\u9fa5]/.test(normalized);
  if (hasChinese) {
    // 转换为拼音（不带音调）
    normalized = pinyin(normalized, { toneType: 'none', type: 'array' }).join('');
  }
  
  // 移除无效词
  for (const word of REMOVE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    normalized = normalized.replace(regex, ' ');
  }
  
  // 只保留字母和数字
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  
  return normalized;
}

/**
 * 获取球队的所有可能名称（包括别名）
 */
function getTeamVariants(name: string): string[] {
  const normalized = normalizeTeamName(name);
  const variants = [normalized];
  
  // 检查别名映射
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const canonicalNorm = normalizeTeamName(canonical);
    if (normalized === canonicalNorm) {
      variants.push(...aliases.map(a => normalizeTeamName(a)));
    }
    for (const alias of aliases) {
      const aliasNorm = normalizeTeamName(alias);
      if (normalized === aliasNorm) {
        variants.push(canonicalNorm);
        variants.push(...aliases.filter(a => a !== alias).map(a => normalizeTeamName(a)));
      }
    }
  }
  
  return [...new Set(variants)];
}

/**
 * Jaccard 相似度（基于 3-gram）
 */
function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set(a.match(/.{1,3}/g) || []);
  const tokensB = new Set(b.match(/.{1,3}/g) || []);
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Levenshtein 距离相似度
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - matrix[b.length][a.length] / maxLen;
}

/**
 * 综合相似度计算
 */
function calculateSimilarity(name1: string, name2: string): number {
  const variants1 = getTeamVariants(name1);
  const variants2 = getTeamVariants(name2);
  
  let maxScore = 0;
  
  for (const v1 of variants1) {
    for (const v2 of variants2) {
      if (!v1 || !v2) continue;
      
      // 完全匹配
      if (v1 === v2) return 1.0;
      
      // 包含匹配
      if (v1.includes(v2) || v2.includes(v1)) {
        const shorter = v1.length < v2.length ? v1 : v2;
        const longer = v1.length < v2.length ? v2 : v1;
        const containScore = 0.85 + (shorter.length / longer.length) * 0.15;
        maxScore = Math.max(maxScore, containScore);
      }
      
      // Jaccard 相似度
      const jaccardScore = jaccardSimilarity(v1, v2);
      maxScore = Math.max(maxScore, jaccardScore);
      
      // Levenshtein 相似度
      const levenScore = levenshteinSimilarity(v1, v2);
      maxScore = Math.max(maxScore, levenScore);
    }
  }
  
  return maxScore;
}

function loadCrownMatches(file: string): CrownMatchFile {
  if (!fs.existsSync(file)) {
    throw new Error(`未找到 crown-gids 文件: ${file}`);
  }
  const content = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(content);

  // 过滤掉特殊盘口
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

async function fetchISportsSchedule(apiKey: string, date: string): Promise<ISportsMatch[]> {
  const url = `${ISPORTS_API_BASE}/schedule/basic`;
  const response = await axios.get(url, {
    params: { api_key: apiKey, date },
    timeout: 30000,
  });

  if (response.data.code !== 0) {
    throw new Error(`iSports Schedule 接口返回错误: ${JSON.stringify(response.data)}`);
  }

  return (response.data.data || []).map((item: any) => ({
    matchId: String(item.matchId),
    leagueName: String(item.leagueName || ''),
    leagueId: String(item.leagueId || ''),
    matchTime: Number(item.matchTime) * 1000,
    status: Number(item.status),
    homeId: String(item.homeId || ''),
    homeName: String(item.homeName || ''),
    awayId: String(item.awayId || ''),
    awayName: String(item.awayName || ''),
    raw: item,
  }));
}

function parseCrownDate(datetime: string, generatedAt: string): Date | null {
  if (!datetime) return null;

  try {
    const match = datetime.match(/(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})([ap])/i);
    if (!match) return null;

    const [, month, day, hour12, minute, ampm] = match;
    let hour = parseInt(hour12, 10);
    if (ampm.toLowerCase() === 'p' && hour !== 12) hour += 12;
    if (ampm.toLowerCase() === 'a' && hour === 12) hour = 0;

    const refDate = parseISO(generatedAt);
    const year = refDate.getFullYear();
    const result = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10), hour, parseInt(minute, 10));

    return result;
  } catch {
    return null;
  }
}

async function main() {
  const crownFilePath = process.env.CROWN_GID_INPUT || DEFAULT_CROWN_FILE;
  const outputPath = process.env.CROWN_MAP_OUTPUT || DEFAULT_OUTPUT;
  const apiKey = process.env.ISPORTS_API_KEY || process.env.ISPORTS_APIKEY || process.env.ISPORTS_KEY;
  const minScore = parseFloat(process.env.CROWN_MAP_MIN_SCORE || '0.48');

  if (!apiKey) {
    console.error('❌ 请在环境变量中设置 ISPORTS_API_KEY');
    process.exit(1);
  }

  console.log(`🔧 配置:`);
  console.log(`  皇冠文件: ${crownFilePath}`);
  console.log(`  输出文件: ${outputPath}`);
  console.log(`  最小相似度: ${minScore}`);
  console.log('');

  const crownData = loadCrownMatches(crownFilePath);
  console.log(`📥 加载皇冠赛事: ${crownData.matches.length} 场`);

  const crownContext: MatchContext[] = crownData.matches.map(m => ({
    crown: m,
    crownDate: parseCrownDate(m.datetime, crownData.generatedAt),
  }));

  // 获取 iSports 赛事（昨天、今天、明天）
  const today = new Date();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const datesToFetch = [
    yesterday.toISOString().split('T')[0],
    today.toISOString().split('T')[0],
    tomorrow.toISOString().split('T')[0],
  ];

  console.log('📥 获取 iSports 赛事...');
  const isportsMatches: ISportsMatch[] = [];

  for (const date of datesToFetch) {
    try {
      console.log(`  ${date}...`);
      const matches = await fetchISportsSchedule(apiKey, date);
      console.log(`    获取到 ${matches.length} 场`);
      isportsMatches.push(...matches);
    } catch (error: any) {
      console.error(`  ❌ 获取失败 (${date}):`, error.message);
    }
  }

  console.log(`✅ 总共获取 ${isportsMatches.length} 场 iSports 赛事`);
  console.log('');

  if (!isportsMatches.length) {
    console.error('❌ 未获取到任何 iSports 赛事，无法建立映射');
    process.exit(1);
  }

  // 反向匹配：从 iSports 赛事出发，在皇冠中查找最佳匹配
  console.log('🔄 开始匹配（从 iSports → 皇冠）...');
  const matchedEntries: MappingEntry[] = [];
  const unmatchedCrown: MatchContext[] = [];
  const usedCrownGids = new Set<string>();

  for (const isMatch of isportsMatches) {
    let best: { ctx: MatchContext; score: number; timeDiff: number } | null = null;

    for (const ctx of crownContext) {
      if (usedCrownGids.has(ctx.crown.crown_gid)) continue;

      const crownMatch = ctx.crown;
      const crownDate = ctx.crownDate;

      const timeDiffMinutes = crownDate
        ? Math.abs(differenceInMinutes(new Date(isMatch.matchTime), crownDate))
        : 720;
      const timeScore = crownDate ? Math.max(0, 1 - timeDiffMinutes / 240) : 0.2;

      const leagueScore = calculateSimilarity(crownMatch.league, isMatch.leagueName);
      const homeScore = calculateSimilarity(crownMatch.home, isMatch.homeName);
      const awayScore = calculateSimilarity(crownMatch.away, isMatch.awayName);

      const combined =
        timeScore * 0.15 +
        leagueScore * 0.15 +
        homeScore * 0.35 +
        awayScore * 0.35;

      if (!best || combined > best.score) {
        best = { ctx, score: combined, timeDiff: timeDiffMinutes };
      }
    }

    if (best && best.score >= minScore) {
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
  console.log(`\n✅ 映射完成，匹配成功 ${matchedEntries.length}/${crownContext.length} 场 (${(matchedEntries.length / crownContext.length * 100).toFixed(1)}%)`);
  console.log(`💾 映射文件已保存到 ${outputPath}`);
  if (unmatchedCrown.length) {
    console.log(`⚠️  尚有 ${unmatchedCrown.length} 场未匹配，可在文件 unmatched 字段查看前 50 条`);
  }
}

main().catch((error) => {
  console.error('❌ 构建映射失败:', error);
  process.exit(1);
});


