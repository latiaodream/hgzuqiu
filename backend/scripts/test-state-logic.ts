/**
 * 测试赛事状态判断逻辑
 */

import fs from 'fs';
import path from 'path';

// 测试数据
const testMatches = [
  { state: 0, period: '未开赛', clock: '', expected: 'today/early' },
  { state: 1, period: '滚球', clock: '45:00', expected: 'live' },
  { state: 2, period: '', clock: '', expected: 'today/early' },
  { state: 3, period: '已结束', clock: '', expected: 'finished' },
  { state: -1, period: '已结束', clock: '', expected: 'finished' },
  { state: 1, period: '1H', clock: '30:00', expected: 'live' },
  { state: 1, period: '2H', clock: '60:00', expected: 'live' },
  { state: 0, period: '', clock: '', expected: 'today/early' },
];

function isLive(match: any): boolean {
  const state = match.state ?? match.status;
  
  // 只有 state === 1 才是滚球
  if (state === 1) return true;
  
  // 字符串状态
  const stateStr = String(state || '').trim().toLowerCase();
  if (stateStr) {
    const tokens = ['rb', 're', 'live', 'inplay', 'in-play', '滚球', '滾球', '进行中', '進行中'];
    if (tokens.some((t) => stateStr.includes(t))) return true;
  }
  
  // period 检查
  const period = String(match.period ?? '').trim().toLowerCase();
  if (period) {
    const nonLivePeriods = ['未开赛', '已结束', '結束', 'finished', 'full time', 'ft'];
    if (nonLivePeriods.some((p) => period.includes(p))) return false;
    
    const livePeriods = ['滚球','滾球','1h','2h','ht','q1','q2','q3','q4','ot','et'];
    if (livePeriods.some((p) => period.includes(p.toLowerCase()))) return true;
  }
  
  // clock 检查
  const clock = String(match.clock ?? '').trim();
  if (clock && clock !== '' && clock !== '0' && clock !== '00:00') return true;
  
  return false;
}

console.log('🧪 测试赛事状态判断逻辑\n');
console.log('=' .repeat(80));

let passed = 0;
let failed = 0;

testMatches.forEach((test, index) => {
  const result = isLive(test);
  const expectedLive = test.expected === 'live';
  const success = result === expectedLive;
  
  if (success) {
    passed++;
    console.log(`✅ 测试 ${index + 1}: state=${test.state}, period="${test.period}", clock="${test.clock}"`);
    console.log(`   预期: ${test.expected}, 实际: ${result ? 'live' : 'not live'}`);
  } else {
    failed++;
    console.log(`❌ 测试 ${index + 1}: state=${test.state}, period="${test.period}", clock="${test.clock}"`);
    console.log(`   预期: ${test.expected}, 实际: ${result ? 'live' : 'not live'}`);
  }
  console.log('');
});

console.log('=' .repeat(80));
console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败\n`);

// 测试实际数据文件
const possiblePaths = [
  path.resolve(process.cwd(), '../fetcher-isports/data/latest-matches.json'),
  path.resolve(process.cwd(), 'fetcher-isports/data/latest-matches.json'),
  path.resolve('/www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json'),
];

let dataFile: string | null = null;
for (const filePath of possiblePaths) {
  if (fs.existsSync(filePath)) {
    dataFile = filePath;
    break;
  }
}

if (dataFile) {
  console.log(`📂 读取实际数据: ${dataFile}\n`);
  
  const fileContent = fs.readFileSync(dataFile, 'utf-8');
  const data = JSON.parse(fileContent);
  const matches = data.matches || [];
  
  const stats: Record<number, number> = {};
  const liveMatches: any[] = [];
  const todayMatches: any[] = [];
  const earlyMatches: any[] = [];
  
  matches.forEach((match: any) => {
    const state = match.state ?? match.status ?? -999;
    stats[state] = (stats[state] || 0) + 1;
    
    if (isLive(match)) {
      liveMatches.push(match);
    } else {
      const matchTime = new Date(match.timer || match.time || match.match_time);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (matchTime >= today && matchTime < tomorrow) {
        todayMatches.push(match);
      } else {
        earlyMatches.push(match);
      }
    }
  });
  
  console.log('📊 状态分布:');
  Object.keys(stats).sort().forEach(state => {
    console.log(`   state ${state}: ${stats[Number(state)]} 场`);
  });
  
  console.log(`\n📊 赛事分类:`);
  console.log(`   - 滚球 (live): ${liveMatches.length} 场`);
  console.log(`   - 今日 (today): ${todayMatches.length} 场`);
  console.log(`   - 早盘 (early): ${earlyMatches.length} 场`);
  console.log(`   - 总计: ${matches.length} 场`);
  
  // 显示前3场滚球比赛的详细信息
  if (liveMatches.length > 0) {
    console.log(`\n🔍 滚球比赛示例 (前3场):`);
    liveMatches.slice(0, 3).forEach((match, index) => {
      console.log(`\n   ${index + 1}. ${match.home} vs ${match.away}`);
      console.log(`      state: ${match.state}, period: "${match.period}", clock: "${match.clock}"`);
      console.log(`      score: ${match.score || 'N/A'}`);
    });
  }
  
  // 显示前3场今日比赛的详细信息
  if (todayMatches.length > 0) {
    console.log(`\n🔍 今日比赛示例 (前3场):`);
    todayMatches.slice(0, 3).forEach((match, index) => {
      console.log(`\n   ${index + 1}. ${match.home} vs ${match.away}`);
      console.log(`      state: ${match.state}, period: "${match.period}", clock: "${match.clock}"`);
      console.log(`      time: ${match.timer || match.time || match.match_time}`);
    });
  }
} else {
  console.log('⚠️  未找到 fetcher-isports 数据文件');
}

if (failed === 0) {
  console.log('\n✅ 所有测试通过！');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} 个测试失败！`);
  process.exit(1);
}

