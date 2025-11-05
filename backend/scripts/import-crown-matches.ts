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
    const result = await parseStringPromise(xml, {
      explicitArray: false,
      ignoreAttrs: false,
    });

    const matches: CrownMatch[] = [];
    const data = result.serverresponse || result;

    if (!data.ec) {
      return matches;
    }

    // ec 可能是单个对象或数组
    const ecList = Array.isArray(data.ec) ? data.ec : [data.ec];

    for (const ec of ecList) {
      if (!ec.game) continue;

      const league = ec.$.ecname || '';
      const games = Array.isArray(ec.game) ? ec.game : [ec.game];

      for (const game of games) {
        matches.push({
          gid: game.$.gid || '',
          league: league,
          home: game.$.team_h || '',
          away: game.$.team_c || '',
          datetime: game.$.datetime || '',
        });
      }
    }

    return matches;
  } catch (error: any) {
    console.error('❌ 解析 XML 失败:', error.message);
    return [];
  }
}

/**
 * 匹配联赛名称
 */
async function matchLeague(crownName: string): Promise<{ matched: boolean; canonicalKey?: string }> {
  try {
    // 尝试通过别名匹配
    const result = await nameAliasService.resolveLeagueName(crownName);
    if (result) {
      return { matched: true, canonicalKey: result.canonicalKey };
    }

    // 尝试模糊匹配（通过 name_crown_zh_cn 字段）
    const allLeagues = await nameAliasService.getAllLeagues();
    for (const league of allLeagues) {
      if (league.name_crown_zh_cn === crownName) {
        return { matched: true, canonicalKey: league.canonical_key };
      }
    }

    return { matched: false };
  } catch (error) {
    return { matched: false };
  }
}

/**
 * 匹配球队名称
 */
async function matchTeam(crownName: string): Promise<{ matched: boolean; canonicalKey?: string }> {
  try {
    // 尝试通过别名匹配
    const result = await nameAliasService.resolveTeamName(crownName);
    if (result) {
      return { matched: true, canonicalKey: result.canonicalKey };
    }

    // 尝试模糊匹配（通过 name_crown_zh_cn 字段）
    const allTeams = await nameAliasService.getAllTeams();
    for (const team of allTeams) {
      if (team.name_crown_zh_cn === crownName) {
        return { matched: true, canonicalKey: team.canonical_key };
      }
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
  const loginResult = await client.login(CROWN_USERNAME, CROWN_PASSWORD);

  if (!loginResult.success) {
    console.error('❌ 登录失败:', loginResult.message);
    process.exit(1);
  }

  console.log('✅ 登录成功');

  // 2. 获取早盘赛事
  console.log('\n📥 获取早盘赛事...');
  const xml = await client.getGameList({
    gtype: 'ft',        // 足球
    showtype: 'early',  // 早盘
    rtype: 'r',         // 让球盘
    ltype: '3',
    sorttype: 'L',
  });

  const matches = await parseCrownGameList(xml);
  console.log(`✅ 获取到 ${matches.length} 场早盘比赛`);

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
    if (match.matched) {
      leagueMatched++;
      // 更新 name_crown_zh_cn 字段
      try {
        await nameAliasService.updateLeagueAlias(match.canonicalKey!, {
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
    if (match.matched) {
      teamMatched++;
      // 更新 name_crown_zh_cn 字段
      try {
        await nameAliasService.updateTeamAlias(match.canonicalKey!, {
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

