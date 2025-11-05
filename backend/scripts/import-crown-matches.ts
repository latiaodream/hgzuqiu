import 'dotenv/config';
import { CrownApiClient } from '../src/services/crown-api-client';
import { nameAliasService } from '../src/services/name-alias-service';
import { parseStringPromise } from 'xml2js';

/**
 * 从皇冠抓取早盘赛事并匹配到 iSports 别名库
 * - 抓取早盘足球赛事
 * - 提取联赛和球队的简体中文名称
 * - 匹配到 iSports 别名库的 name_crown_zh_cn 字段
 * - 统计匹配率
 *
 * 运行示例：
 *   npm run aliases:import-crown
 */

function getArg(name: string, defaultValue?: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
}

const CROWN_USERNAME = process.env.CROWN_USERNAME || getArg('username') || '';
const CROWN_PASSWORD = process.env.CROWN_PASSWORD || getArg('password') || '';

if (!CROWN_USERNAME || !CROWN_PASSWORD) {
  console.error('❌ 缺少皇冠账号信息');
  console.error('   请设置环境变量: CROWN_USERNAME, CROWN_PASSWORD');
  console.error('   或使用参数: --username=xxx --password=xxx');
  process.exit(1);
}

interface CrownMatch {
  gid: string;
  league: string;
  home: string;
  away: string;
  datetime: string;
}

/**
 * 解析皇冠 XML 赛事列表
 */
async function parseCrownGameList(xml: string): Promise<CrownMatch[]> {
  try {
    // 打印 XML 前 1000 字符用于调试
    console.log('\n📄 XML 响应（前 1000 字符）:');
    console.log(xml.substring(0, 1000));

    const result = await parseStringPromise(xml, {
      explicitArray: false,
      ignoreAttrs: false,
    });

    const matches: CrownMatch[] = [];
    const data = result.serverresponse || result;

    console.log('\n🔍 解析结果:');
    console.log('  - 是否有 ec:', !!data.ec);
    console.log('  - ec 类型:', Array.isArray(data.ec) ? 'array' : typeof data.ec);

    if (!data.ec) {
      console.log('⚠️  没有找到 ec 节点');
      return matches;
    }

    // ec 可能是单个对象或数组
    const ecList = Array.isArray(data.ec) ? data.ec : [data.ec];
    console.log('  - ec 数量:', ecList.length);

    for (const ec of ecList) {
      if (!ec.game) {
        console.log('  - 跳过没有 game 的 ec');
        continue;
      }

      const games = Array.isArray(ec.game) ? ec.game : [ec.game];

      console.log(`  - ec 节点, 比赛数: ${games.length}`);

      for (const game of games) {
        // 联赛名称在 game 节点的 LEAGUE 字段，不在 ec 节点
        const league = game.LEAGUE || game.$.LEAGUE || '';
        const gid = game.GID || game.$.GID || '';
        const home = game.TEAM_H || game.$.TEAM_H || '';
        const away = game.TEAM_C || game.$.TEAM_C || '';
        const datetime = game.DATETIME || game.$.DATETIME || '';

        matches.push({
          gid,
          league,
          home,
          away,
          datetime,
        });
      }
    }

    return matches;
  } catch (error: any) {
    console.error('❌ 解析 XML 失败:', error.message);
    console.error('   错误堆栈:', error.stack);
    return [];
  }
}

/**
 * 计算字符串相似度（简单版本）
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) {
    return 1.0;
  }

  // 包含关系得分更高
  if (longer.includes(shorter)) {
    return 0.8 + (shorter.length / longer.length) * 0.2;
  }

  // 计算编辑距离
  const editDistance = levenshteinDistance(s1, s2);
  return (longer.length - editDistance) / longer.length;
}

/**
 * 计算编辑距离
 */
function levenshteinDistance(s1: string, s2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
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

  return matrix[s2.length][s1.length];
}

/**
 * 匹配联赛名称（支持模糊匹配）
 */
async function matchLeague(crownName: string): Promise<{ matched: boolean; id?: number; similarity?: number }> {
  try {
    // 1. 尝试通过别名精确匹配
    const result = await nameAliasService.resolveLeague(crownName);
    if (result && result.canonicalKey) {
      const league = await nameAliasService.getLeagueByKey(result.canonicalKey);
      if (league) {
        return { matched: true, id: league.id, similarity: 1.0 };
      }
    }

    // 2. 尝试精确匹配 name_crown_zh_cn
    const allLeagues = await nameAliasService.getAllLeagues();
    for (const league of allLeagues) {
      if (league.name_crown_zh_cn === crownName) {
        return { matched: true, id: league.id, similarity: 1.0 };
      }
    }

    // 3. 模糊匹配（相似度 >= 0.7）
    let bestMatch: { league: any; score: number } | null = null;

    for (const league of allLeagues) {
      // 与 name_crown_zh_cn 比较
      if (league.name_crown_zh_cn) {
        const score = similarity(crownName, league.name_crown_zh_cn);
        if (score >= 0.7 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { league, score };
        }
      }

      // 与 name_zh_cn 比较
      if (league.name_zh_cn) {
        const score = similarity(crownName, league.name_zh_cn);
        if (score >= 0.7 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { league, score };
        }
      }

      // 与 name_zh_tw 比较
      if (league.name_zh_tw) {
        const score = similarity(crownName, league.name_zh_tw);
        if (score >= 0.7 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { league, score };
        }
      }
    }

    if (bestMatch) {
      return { matched: true, id: bestMatch.league.id, similarity: bestMatch.score };
    }

    return { matched: false };
  } catch (error) {
    return { matched: false };
  }
}

/**
 * 匹配球队名称（支持模糊匹配）
 */
async function matchTeam(crownName: string): Promise<{ matched: boolean; id?: number; similarity?: number }> {
  try {
    // 1. 尝试通过别名精确匹配
    const result = await nameAliasService.resolveTeam(crownName);
    if (result && result.canonicalKey) {
      const team = await nameAliasService.getTeamByKey(result.canonicalKey);
      if (team) {
        return { matched: true, id: team.id, similarity: 1.0 };
      }
    }

    // 2. 尝试精确匹配 name_crown_zh_cn
    const allTeams = await nameAliasService.getAllTeams();
    for (const team of allTeams) {
      if (team.name_crown_zh_cn === crownName) {
        return { matched: true, id: team.id, similarity: 1.0 };
      }
    }

    // 3. 模糊匹配（相似度 >= 0.75）
    let bestMatch: { team: any; score: number } | null = null;

    for (const team of allTeams) {
      // 与 name_crown_zh_cn 比较
      if (team.name_crown_zh_cn) {
        const score = similarity(crownName, team.name_crown_zh_cn);
        if (score >= 0.75 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { team, score };
        }
      }

      // 与 name_zh_cn 比较
      if (team.name_zh_cn) {
        const score = similarity(crownName, team.name_zh_cn);
        if (score >= 0.75 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { team, score };
        }
      }

      // 与 name_zh_tw 比较
      if (team.name_zh_tw) {
        const score = similarity(crownName, team.name_zh_tw);
        if (score >= 0.75 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { team, score };
        }
      }
    }

    if (bestMatch) {
      return { matched: true, id: bestMatch.team.id, similarity: bestMatch.score };
    }

    return { matched: false };
  } catch (error) {
    return { matched: false };
  }
}

async function main() {
  console.log('============================================================');
  console.log('🚀 从皇冠抓取早盘赛事并匹配到 iSports 别名库');
  console.log('============================================================');

  // 1. 登录皇冠
  console.log('\n🔐 登录皇冠...');
  const client = new CrownApiClient();

  try {
    const loginResult = await client.login(CROWN_USERNAME, CROWN_PASSWORD);

    // 检查登录是否成功（msg=100 或 status=success）
    if (loginResult.msg !== '100' && loginResult.status !== 'success') {
      console.error('❌ 登录失败:', loginResult);
      process.exit(1);
    }

    console.log('✅ 登录成功');
  } catch (error: any) {
    console.error('❌ 登录失败:', error.message);
    process.exit(1);
  }

  // 2. 获取早盘赛事
  console.log('\n📥 获取早盘赛事...');
  const xml = await client.getGameList({
    gtype: 'ft',        // 足球
    showtype: 'early',  // 早盘
    rtype: 'r',         // 让球盘
    ltype: '3',
    sorttype: 'L',
    langx: 'zh-cn',     // 使用简体中文
  });

  const matches = await parseCrownGameList(xml);
  console.log(`✅ 获取到 ${matches.length} 场早盘比赛`);

  // 调试：打印前 3 场比赛
  if (matches.length > 0) {
    console.log('\n📋 示例比赛（前 3 场）:');
    matches.slice(0, 3).forEach((m, i) => {
      console.log(`  [${i + 1}] ${m.league} | ${m.home} vs ${m.away}`);
    });
  }

  if (matches.length === 0) {
    console.log('⚠️  没有早盘赛事，结束');
    return;
  }

  // 3. 收集联赛和球队
  const leagueSet = new Set<string>();
  const teamSet = new Set<string>();

  matches.forEach((m) => {
    if (m.league) leagueSet.add(m.league);
    if (m.home) teamSet.add(m.home);
    if (m.away) teamSet.add(m.away);
  });

  console.log(`\n🏷️  联赛（去重）: ${leagueSet.size}`);
  console.log(`🏷️  球队（去重）: ${teamSet.size}`);

  // 4. 匹配并更新联赛
  console.log('\n📝 匹配并更新联赛...');
  let leagueMatched = 0;
  let leagueUpdated = 0;
  const unmatchedLeagues: string[] = [];

  for (const leagueName of leagueSet) {
    const match = await matchLeague(leagueName);
    if (match.matched && match.id) {
      leagueMatched++;
      // 更新 name_crown_zh_cn 字段
      try {
        await nameAliasService.updateLeagueAlias(match.id, {
          nameCrownZhCn: leagueName,
        });
        leagueUpdated++;
      } catch (e) {
        // 忽略错误
      }
    } else {
      unmatchedLeagues.push(leagueName);
    }
  }

  // 5. 匹配并更新球队
  console.log('\n📝 匹配并更新球队...');
  let teamMatched = 0;
  let teamUpdated = 0;
  const unmatchedTeams: string[] = [];

  for (const teamName of teamSet) {
    const match = await matchTeam(teamName);
    if (match.matched && match.id) {
      teamMatched++;
      // 更新 name_crown_zh_cn 字段
      try {
        await nameAliasService.updateTeamAlias(match.id, {
          nameCrownZhCn: teamName,
        });
        teamUpdated++;
      } catch (e) {
        // 忽略错误
      }
    } else {
      unmatchedTeams.push(teamName);
    }
  }

  // 6. 统计结果
  console.log('\n============================================================');
  console.log('✅ 匹配完成！');
  console.log('📊 统计：');
  console.log(`   - 总比赛数: ${matches.length} 场`);
  console.log(`   - 联赛总数: ${leagueSet.size} 个`);
  console.log(`   - 联赛匹配: ${leagueMatched} 个 (${((leagueMatched / leagueSet.size) * 100).toFixed(1)}%)`);
  console.log(`   - 联赛更新: ${leagueUpdated} 个`);
  console.log(`   - 球队总数: ${teamSet.size} 个`);
  console.log(`   - 球队匹配: ${teamMatched} 个 (${((teamMatched / teamSet.size) * 100).toFixed(1)}%)`);
  console.log(`   - 球队更新: ${teamUpdated} 个`);

  if (unmatchedLeagues.length > 0) {
    console.log(`\n⚠️  未匹配的联赛 (${unmatchedLeagues.length} 个):`);
    unmatchedLeagues.slice(0, 20).forEach((name) => console.log(`   - ${name}`));
    if (unmatchedLeagues.length > 20) {
      console.log(`   ... 还有 ${unmatchedLeagues.length - 20} 个`);
    }
  }

  if (unmatchedTeams.length > 0) {
    console.log(`\n⚠️  未匹配的球队 (${unmatchedTeams.length} 个):`);
    unmatchedTeams.slice(0, 20).forEach((name) => console.log(`   - ${name}`));
    if (unmatchedTeams.length > 20) {
      console.log(`   ... 还有 ${unmatchedTeams.length - 20} 个`);
    }
  }

  console.log('\n💡 提示：未匹配的联赛/球队可能是 iSports 没有的数据');
  console.log('💡 提示：可以在页面上手动添加或等待 iSports 导入脚本更新');
}

main().catch((err) => {
  console.error('❌ 执行失败:', err?.message || err);
  process.exit(1);
});

