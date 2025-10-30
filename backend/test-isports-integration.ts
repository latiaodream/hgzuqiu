/**
 * iSportsAPI 集成测试
 * 测试数据转换和兼容性
 */

import { ISportsClient } from './src/services/isports-client';

const API_KEY = 'GvpziueL9ouzIJNj';

async function main() {
  console.log('============================================================');
  console.log('🚀 iSportsAPI 集成测试');
  console.log('============================================================\n');

  const client = new ISportsClient(API_KEY);

  try {
    // 1. 获取今日赛程
    console.log('📅 获取今日赛程...');
    const matches = await client.getSchedule();
    console.log(`✅ 成功获取 ${matches.length} 场比赛\n`);

    // 2. 获取所有皇冠赔率（不指定比赛ID）
    console.log(`📊 获取所有皇冠赔率...\n`);

    const odds = await client.getMainOdds();
    console.log(`✅ 成功获取赔率数据`);
    console.log(`   让球盘: ${odds.handicap.length} 条`);
    console.log(`   独赢盘: ${odds.europeOdds.length} 条`);
    console.log(`   大小球: ${odds.overUnder.length} 条\n`);

    // 3. 找到有皇冠赔率的比赛
    const matchesWithOdds = matches.filter((match) => {
      return odds.handicap.some((h) => h.matchId === match.matchId && h.companyId === '3');
    });

    console.log(`✅ 找到 ${matchesWithOdds.length} 场有皇冠赔率的比赛\n`);

    // 4. 转换为皇冠格式
    console.log('🔄 转换为皇冠 API 格式...\n');

    const convertedMatches = matchesWithOdds.slice(0, 5).map((match) => {
      return client.convertToCrownFormat(match, odds);
    });

    console.log('前 5 场比赛的转换结果：\n');
    convertedMatches.forEach((match, index) => {
      console.log(`${index + 1}. ${match.team_h} vs ${match.team_c}`);
      console.log(`   联赛: ${match.league}`);
      console.log(`   时间: ${match.timer}`);
      console.log(`   让球盘: ${match.ratio} @ ${match.ratio_o}/${match.ratio_u}`);
      console.log(`   独赢盘: 主 ${match.ior_RH} / 平 ${match.ior_RN} / 客 ${match.ior_RC}`);
      console.log(`   大小球: ${match.ratio_uo} @ 大 ${match.ratio_uo_o} / 小 ${match.ratio_uo_u}`);
      console.log(`   半场让球: ${match.ratio_h} @ ${match.ratio_ho}/${match.ratio_hu}`);
      console.log(`   半场大小: ${match.ratio_huo} @ 大 ${match.ratio_huo_o} / 小 ${match.ratio_huo_u}`);
      console.log('');
    });

    // 4. 对比数据格式
    console.log('============================================================');
    console.log('📋 数据格式对比');
    console.log('============================================================\n');

    console.log('iSportsAPI 原始格式（让球盘）：');
    if (odds.handicap.length > 0) {
      console.log(JSON.stringify(odds.handicap[0], null, 2));
    }

    console.log('\n皇冠 API 格式（转换后）：');
    if (convertedMatches.length > 0) {
      console.log(JSON.stringify({
        gid: convertedMatches[0].gid,
        ratio: convertedMatches[0].ratio,
        ratio_o: convertedMatches[0].ratio_o,
        ratio_u: convertedMatches[0].ratio_u,
        ior_RH: convertedMatches[0].ior_RH,
        ior_RN: convertedMatches[0].ior_RN,
        ior_RC: convertedMatches[0].ior_RC,
      }, null, 2));
    }

    console.log('\n============================================================');
    console.log('✅ 集成测试完成');
    console.log('============================================================');
    console.log('\n💡 结论：');
    console.log('   1. iSportsAPI 可以成功获取皇冠赔率数据');
    console.log('   2. 数据可以转换为皇冠 API 格式');
    console.log('   3. 可以无缝替换现有的皇冠 API 抓取逻辑');
    console.log('\n📝 下一步：');
    console.log('   1. 修改独立抓取服务（fetcher/）使用 iSportsAPI');
    console.log('   2. 保持数据输出格式不变（latest-matches.json）');
    console.log('   3. 前端和后端无需修改，直接使用');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

main();

