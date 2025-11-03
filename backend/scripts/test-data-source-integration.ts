import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * 测试数据源整合功能
 * 
 * 检查项:
 * 1. crown-gids.json 是否存在
 * 2. crown-match-map.json 是否存在
 * 3. latest-matches.json 是否包含 source 字段
 * 4. 统计各数据源的比赛数量
 */

async function main() {
  console.log('============================================================');
  console.log('🧪 测试数据源整合功能');
  console.log('============================================================\n');

  // 1. 检查 crown-gids.json
  console.log('📋 检查 crown-gids.json...');
  const crownGidsPath = path.resolve(process.cwd(), 'crown-gids.json');
  if (!fs.existsSync(crownGidsPath)) {
    console.log('❌ crown-gids.json 不存在');
    console.log('   请先运行: npm run crown:fetch-gids');
    process.exit(1);
  }

  const crownGidsData = JSON.parse(fs.readFileSync(crownGidsPath, 'utf-8'));
  const crownMatchCount = crownGidsData.matchCount || 0;
  console.log(`✅ crown-gids.json 存在`);
  console.log(`   生成时间: ${crownGidsData.generatedAt}`);
  console.log(`   比赛数量: ${crownMatchCount} 场\n`);

  // 2. 检查 crown-match-map.json
  console.log('📋 检查 crown-match-map.json...');
  const crownMapPath = path.resolve(process.cwd(), '../fetcher-isports/data/crown-match-map.json');
  if (!fs.existsSync(crownMapPath)) {
    console.log('⚠️  crown-match-map.json 不存在');
    console.log('   请先运行: npm run crown:build-map');
    console.log('   继续测试...\n');
  } else {
    const crownMapData = JSON.parse(fs.readFileSync(crownMapPath, 'utf-8'));
    const matchedCount = crownMapData.matchedCount || 0;
    const unmatchedCount = crownMapData.unmatchedCount || 0;
    console.log(`✅ crown-match-map.json 存在`);
    console.log(`   生成时间: ${crownMapData.generatedAt}`);
    console.log(`   匹配数量: ${matchedCount} 场`);
    console.log(`   未匹配数量: ${unmatchedCount} 场\n`);
  }

  // 3. 检查 latest-matches.json
  console.log('📋 检查 latest-matches.json...');
  const latestMatchesPath = path.resolve(process.cwd(), '../fetcher-isports/data/latest-matches.json');
  if (!fs.existsSync(latestMatchesPath)) {
    console.log('❌ latest-matches.json 不存在');
    console.log('   请确保 fetcher-isports 服务正在运行');
    process.exit(1);
  }

  const latestMatchesData = JSON.parse(fs.readFileSync(latestMatchesPath, 'utf-8'));
  const matches = latestMatchesData.matches || [];
  console.log(`✅ latest-matches.json 存在`);
  console.log(`   更新时间: ${new Date(latestMatchesData.timestamp).toLocaleString()}`);
  console.log(`   比赛数量: ${matches.length} 场\n`);

  // 4. 统计数据源
  console.log('📊 统计数据源分布...');
  const sourceStats = {
    isports: 0,
    crown: 0,
    hybrid: 0,
    unknown: 0,
  };

  const sampleMatches: any[] = [];

  matches.forEach((match: any) => {
    const source = match.source || 'unknown';
    if (source === 'isports') {
      sourceStats.isports++;
      if (sampleMatches.length < 3) {
        sampleMatches.push({ source, league: match.league, home: match.home, away: match.away });
      }
    } else if (source === 'crown') {
      sourceStats.crown++;
      if (sampleMatches.length < 6) {
        sampleMatches.push({ source, league: match.league, home: match.home, away: match.away });
      }
    } else if (source === 'hybrid') {
      sourceStats.hybrid++;
    } else {
      sourceStats.unknown++;
    }
  });

  console.log(`   iSports 数据源: ${sourceStats.isports} 场 (${((sourceStats.isports / matches.length) * 100).toFixed(1)}%)`);
  console.log(`   皇冠数据源: ${sourceStats.crown} 场 (${((sourceStats.crown / matches.length) * 100).toFixed(1)}%)`);
  console.log(`   混合数据源: ${sourceStats.hybrid} 场 (${((sourceStats.hybrid / matches.length) * 100).toFixed(1)}%)`);
  console.log(`   未知数据源: ${sourceStats.unknown} 场 (${((sourceStats.unknown / matches.length) * 100).toFixed(1)}%)\n`);

  // 5. 检查 source 字段
  console.log('🔍 检查 source 字段...');
  const matchesWithoutSource = matches.filter((m: any) => !m.source);
  if (matchesWithoutSource.length > 0) {
    console.log(`⚠️  有 ${matchesWithoutSource.length} 场比赛缺少 source 字段`);
    console.log('   示例:');
    matchesWithoutSource.slice(0, 3).forEach((m: any) => {
      console.log(`   - ${m.league}: ${m.home} vs ${m.away}`);
    });
    console.log('');
  } else {
    console.log(`✅ 所有比赛都有 source 字段\n`);
  }

  // 6. 检查 crown_gid 字段
  console.log('🔍 检查 crown_gid 字段...');
  const matchesWithoutCrownGid = matches.filter((m: any) => !m.crown_gid);
  if (matchesWithoutCrownGid.length > 0) {
    console.log(`⚠️  有 ${matchesWithoutCrownGid.length} 场比赛缺少 crown_gid 字段`);
    console.log('   这些比赛可能无法下注!');
    console.log('   示例:');
    matchesWithoutCrownGid.slice(0, 3).forEach((m: any) => {
      console.log(`   - [${m.source}] ${m.league}: ${m.home} vs ${m.away}`);
    });
    console.log('');
  } else {
    console.log(`✅ 所有比赛都有 crown_gid 字段\n`);
  }

  // 7. 显示示例数据
  console.log('📝 示例数据:');
  sampleMatches.forEach((m, idx) => {
    const sourceLabel = m.source === 'crown' ? '🟠 皇冠' : m.source === 'isports' ? '🟢 iSports' : '🔵 混合';
    console.log(`   ${idx + 1}. ${sourceLabel} | ${m.league}: ${m.home} vs ${m.away}`);
  });
  console.log('');

  // 8. 总结
  console.log('============================================================');
  console.log('✅ 测试完成');
  console.log('============================================================');
  console.log(`总比赛数: ${matches.length} 场`);
  console.log(`  - iSports: ${sourceStats.isports} 场 (有中文翻译)`);
  console.log(`  - 皇冠独有: ${sourceStats.crown} 场 (无 iSports 匹配)`);
  console.log(`  - 混合: ${sourceStats.hybrid} 场`);
  console.log('');

  if (sourceStats.crown > 0) {
    console.log('💡 提示:');
    console.log('   - 皇冠独有的比赛可以正常下注');
    console.log('   - 下注前会自动获取最新赔率');
    console.log('   - 前端会显示橙色 [皇冠] 标记');
  }

  if (matchesWithoutCrownGid.length > 0) {
    console.log('');
    console.log('⚠️  警告:');
    console.log(`   有 ${matchesWithoutCrownGid.length} 场比赛缺少 crown_gid，可能无法下注`);
    console.log('   请检查数据匹配逻辑');
  }

  console.log('');
}

main().catch((error) => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});

