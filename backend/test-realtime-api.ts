/**
 * 测试皇冠 API 的实时数据更新频率
 * 
 * 这个脚本会：
 * 1. 使用现有的 CrownApiClient 登录
 * 2. 每 500ms 调用一次 get_game_list
 * 3. 记录数据变化
 * 4. 分析更新频率
 */

import { CrownApiClient } from './src/services/crown-api-client';
import { XMLParser } from 'fast-xml-parser';

const config = {
  baseUrl: 'https://hga026.com',
  username: 'pWtx91F0jC',
  password: 'aa123123',
};

interface GameSnapshot {
  time: string;
  gid: string;
  scoreH: string;
  scoreC: string;
  handicapLine: string;
  handicapHome: string;
  handicapAway: string;
  ouLine: string;
  ouOver: string;
  ouUnder: string;
}

async function testRealtimeUpdates() {
  console.log('🚀 开始测试皇冠 API 实时数据更新频率\n');

  // 1. 创建客户端并登录
  const client = new CrownApiClient({ baseUrl: config.baseUrl });
  
  console.log('🔐 登录中...');
  const loginResult = await client.login(config.username, config.password);

  if (!loginResult.uid) {
    console.error('❌ 登录失败:', loginResult);
    return;
  }

  console.log('✅ 登录成功! UID:', loginResult.uid);
  console.log('');

  // 2. 测试数据更新频率
  console.log('📊 开始测试数据更新频率（持续 30 秒）...\n');
  
  const snapshots: GameSnapshot[] = [];
  const testDuration = 30000; // 30 秒
  const interval = 500; // 每 500ms 抓取一次
  
  const startTime = Date.now();
  let count = 0;
  let changeCount = 0;
  
  while (Date.now() - startTime < testDuration) {
    count++;
    
    try {
      // 调用 get_game_list
      const xml = await client.getGameList({
        gtype: 'ft',
        showtype: 'live',
        rtype: 'rb',
        ltype: '3',
        sorttype: 'L',
      });
      
      if (!xml) {
        console.log(`⚠️ [${count}] 未获取到数据`);
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }
      
      // 解析 XML
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml);
      
      const ec = parsed?.serverresponse?.ec;
      if (!ec) {
        console.log(`⚠️ [${count}] XML 中没有赛事数据`);
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }
      
      const ecArray = Array.isArray(ec) ? ec : [ec];
      const allGames: any[] = [];
      for (const ecItem of ecArray) {
        const games = ecItem?.game;
        if (!games) continue;
        if (Array.isArray(games)) {
          allGames.push(...games);
        } else {
          allGames.push(games);
        }
      }
      
      if (allGames.length === 0) {
        console.log(`⚠️ [${count}] 没有比赛`);
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }
      
      // 记录第一场比赛的数据
      const firstGame = allGames[0];
      const pickString = (keys: string[]): string => {
        for (const key of keys) {
          if (firstGame[key]) return String(firstGame[key]);
          if (firstGame[`@_${key}`]) return String(firstGame[`@_${key}`]);
        }
        return '';
      };
      
      const snapshot: GameSnapshot = {
        time: new Date().toISOString(),
        gid: pickString(['GID']),
        scoreH: pickString(['SCORE_H']),
        scoreC: pickString(['SCORE_C']),
        handicapLine: pickString(['RATIO_RE', 'RATIO_R']),
        handicapHome: pickString(['IOR_REH', 'IOR_RH']),
        handicapAway: pickString(['IOR_REC', 'IOR_RC']),
        ouLine: pickString(['RATIO_ROUO', 'RATIO_OUO']),
        ouOver: pickString(['IOR_ROUC', 'IOR_OUC']),
        ouUnder: pickString(['IOR_ROUH', 'IOR_OUH']),
      };
      
      snapshots.push(snapshot);
      
      // 检查是否有变化
      if (snapshots.length > 1) {
        const prev = snapshots[snapshots.length - 2];
        const curr = snapshot;
        
        const changes: string[] = [];
        if (prev.scoreH !== curr.scoreH || prev.scoreC !== curr.scoreC) {
          changes.push('比分');
        }
        if (prev.handicapLine !== curr.handicapLine || prev.handicapHome !== curr.handicapHome || prev.handicapAway !== curr.handicapAway) {
          changes.push('让球');
        }
        if (prev.ouLine !== curr.ouLine || prev.ouOver !== curr.ouOver || prev.ouUnder !== curr.ouUnder) {
          changes.push('大小球');
        }
        
        if (changes.length > 0) {
          changeCount++;
          console.log(`🔄 [${count}] 数据变化: ${changes.join(', ')}`);
          console.log(`   比分: ${prev.scoreH}-${prev.scoreC} → ${curr.scoreH}-${curr.scoreC}`);
          console.log(`   让球: ${prev.handicapLine} (${prev.handicapHome}/${prev.handicapAway}) → ${curr.handicapLine} (${curr.handicapHome}/${curr.handicapAway})`);
          console.log(`   大小: ${prev.ouLine} (${prev.ouOver}/${prev.ouUnder}) → ${curr.ouLine} (${curr.ouOver}/${curr.ouUnder})`);
        } else {
          process.stdout.write(`✓ [${count}] `);
        }
      } else {
        console.log(`✓ [${count}] 首次抓取: ${snapshot.gid} (${allGames.length} 场比赛)`);
      }
      
    } catch (error: any) {
      console.error(`❌ [${count}] 错误:`, error.message);
    }
    
    // 等待下一次抓取
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  console.log('\n\n📊 测试完成！');
  console.log('='.repeat(60));
  console.log(`⏱️  测试时长: ${testDuration / 1000} 秒`);
  console.log(`📈 总抓取次数: ${count}`);
  console.log(`🔄 数据变化次数: ${changeCount}`);
  console.log(`📊 变化频率: ${changeCount > 0 ? ((changeCount / count) * 100).toFixed(1) : 0}%`);
  console.log(`⏰ 平均变化间隔: ${changeCount > 0 ? ((testDuration / changeCount) / 1000).toFixed(1) : 'N/A'} 秒`);
  console.log('='.repeat(60));
  
  // 3. 分析结论
  console.log('\n💡 结论:');
  if (changeCount === 0) {
    console.log('   ⚠️ 测试期间没有数据变化，可能是：');
    console.log('      1. 比赛处于稳定状态（没有进球、盘口未调整）');
    console.log('      2. 测试时间太短');
    console.log('      3. 需要更长时间的测试');
  } else {
    const avgInterval = (testDuration / changeCount) / 1000;
    console.log(`   ✅ 数据平均每 ${avgInterval.toFixed(1)} 秒变化一次`);
    
    if (avgInterval < 2) {
      console.log('   💡 建议: 数据变化频繁，可以考虑每 1 秒抓取一次');
    } else if (avgInterval < 5) {
      console.log('   💡 建议: 数据变化适中，当前每 1 秒抓取已足够');
    } else {
      console.log('   💡 建议: 数据变化较慢，可以考虑每 2-3 秒抓取一次');
    }
  }
  
  console.log('\n🔍 关于 WebSocket:');
  console.log('   皇冠网站可能使用以下方式之一：');
  console.log('   1. 轮询 (Polling): 定期调用 get_game_list API');
  console.log('   2. 长轮询 (Long Polling): 保持连接直到有数据更新');
  console.log('   3. WebSocket: 实时双向通信');
  console.log('   4. Server-Sent Events (SSE): 服务器推送');
  console.log('');
  console.log('   根据测试结果，皇冠网站很可能使用 **轮询** 方式，');
  console.log('   因为我们通过 API 调用就能获取到最新数据。');
  console.log('');
  console.log('   如果官方网站使用 WebSocket，那是为了减少服务器负载，');
  console.log('   但对于我们的用例，使用 API 轮询已经足够。');
}

// 运行测试
testRealtimeUpdates().catch(console.error);

