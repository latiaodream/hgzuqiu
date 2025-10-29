/**
 * 测试皇冠网站的实时数据推送机制
 * 
 * 策略：
 * 1. 使用现有的 API 客户端登录
 * 2. 快速连续调用 get_game_list 多次
 * 3. 比较数据变化，分析更新频率
 * 4. 查找是否有其他实时 API 端点
 */

const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const config = {
  baseUrl: 'https://hga026.com',
  username: 'pWtx91F0jC',
  password: 'aa123123',
  version: '2024102801',
};

let uid = null;
const client = axios.create({
  baseURL: config.baseUrl,
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
});

/**
 * 登录
 */
async function login() {
  console.log('🔐 开始登录...');
  
  const params = new URLSearchParams({
    ver: config.version,
    langx: 'zh-cn',
    p: 'chk_login',
    username: config.username,
    passwd: config.password,
    code: '',
    blackbox: '',
  });

  try {
    const response = await client.post(`/transform.php?ver=${config.version}`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const xml = response.data;
    console.log('📥 登录响应 XML:', xml.substring(0, 500));

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    console.log('📋 解析后的数据:', JSON.stringify(parsed, null, 2).substring(0, 500));

    const loginData = parsed?.serverresponse;
    if (loginData?.uid || loginData?.['@_uid']) {
      uid = loginData.uid || loginData['@_uid'];
      console.log('✅ 登录成功! UID:', uid);
      return true;
    } else {
      console.error('❌ 登录失败，完整响应:', JSON.stringify(parsed, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ 登录错误:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

/**
 * 获取赛事列表
 */
async function getGameList() {
  if (!uid) {
    console.error('❌ 未登录');
    return null;
  }

  const timestamp = Date.now().toString();
  const params = new URLSearchParams({
    uid: uid,
    ver: config.version,
    langx: 'zh-cn',
    p: 'get_game_list',
    gtype: 'ft',
    showtype: 'live',
    rtype: 'rb',
    ltype: '3',
    sorttype: 'L',
    date: '',
    filter: 'Main',
    p3type: '',
    cupFantasy: '',
    ts: timestamp,
  });

  try {
    const response = await client.post(`/transform.php?ver=${config.version}`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const xml = response.data;
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    
    const ec = parsed?.serverresponse?.ec;
    if (!ec) return [];

    const ecArray = Array.isArray(ec) ? ec : [ec];
    const allGames = [];
    for (const ecItem of ecArray) {
      const games = ecItem?.game;
      if (!games) continue;
      if (Array.isArray(games)) {
        allGames.push(...games);
      } else {
        allGames.push(games);
      }
    }

    return allGames;
  } catch (error) {
    console.error('❌ 获取赛事失败:', error.message);
    return null;
  }
}

/**
 * 测试数据更新频率
 */
async function testUpdateFrequency() {
  console.log('\n📊 测试数据更新频率...\n');
  
  const snapshots = [];
  const testDuration = 30000; // 测试 30 秒
  const interval = 500; // 每 500ms 抓取一次
  
  const startTime = Date.now();
  let count = 0;
  
  while (Date.now() - startTime < testDuration) {
    count++;
    const games = await getGameList();
    
    if (games && games.length > 0) {
      // 只记录第一场比赛的关键数据
      const firstGame = games[0];
      const snapshot = {
        time: new Date().toISOString(),
        gid: firstGame.GID || firstGame['@_GID'],
        scoreH: firstGame.SCORE_H || firstGame['@_SCORE_H'],
        scoreC: firstGame.SCORE_C || firstGame['@_SCORE_C'],
        handicapLine: firstGame.RATIO_RE || firstGame['@_RATIO_RE'],
        handicapHome: firstGame.IOR_REH || firstGame['@_IOR_REH'],
        handicapAway: firstGame.IOR_REC || firstGame['@_IOR_REC'],
        ouLine: firstGame.RATIO_ROUO || firstGame['@_RATIO_ROUO'],
        ouOver: firstGame.IOR_ROUC || firstGame['@_IOR_ROUC'],
        ouUnder: firstGame.IOR_ROUH || firstGame['@_IOR_ROUH'],
      };
      
      snapshots.push(snapshot);
      
      // 检查是否有变化
      if (snapshots.length > 1) {
        const prev = snapshots[snapshots.length - 2];
        const curr = snapshot;
        
        const changes = [];
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
          console.log(`🔄 [${count}] 数据变化: ${changes.join(', ')}`);
          console.log(`   比分: ${prev.scoreH}-${prev.scoreC} → ${curr.scoreH}-${curr.scoreC}`);
          console.log(`   让球: ${prev.handicapLine} (${prev.handicapHome}/${prev.handicapAway}) → ${curr.handicapLine} (${curr.handicapHome}/${curr.handicapAway})`);
          console.log(`   大小: ${prev.ouLine} (${prev.ouOver}/${prev.ouUnder}) → ${curr.ouLine} (${curr.ouOver}/${curr.ouUnder})`);
        } else {
          console.log(`✓ [${count}] 无变化`);
        }
      } else {
        console.log(`✓ [${count}] 首次抓取: ${snapshot.gid}`);
      }
    }
    
    // 等待下一次抓取
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  console.log('\n📊 测试完成！');
  console.log(`   总抓取次数: ${count}`);
  console.log(`   数据变化次数: ${snapshots.filter((s, i) => {
    if (i === 0) return false;
    const prev = snapshots[i - 1];
    return prev.scoreH !== s.scoreH || prev.scoreC !== s.scoreC ||
           prev.handicapLine !== s.handicapLine || prev.handicapHome !== s.handicapHome ||
           prev.ouLine !== s.ouLine || prev.ouOver !== s.ouOver;
  }).length}`);
}

/**
 * 探测其他可能的实时 API
 */
async function probeRealtimeAPIs() {
  console.log('\n🔍 探测其他可能的实时 API...\n');
  
  const endpoints = [
    'get_game_realtime',
    'get_game_update',
    'get_game_stream',
    'get_odds_update',
    'subscribe_game',
    'ws_connect',
    'realtime_odds',
    'live_update',
  ];
  
  for (const endpoint of endpoints) {
    try {
      const params = new URLSearchParams({
        uid: uid,
        ver: config.version,
        langx: 'zh-cn',
        p: endpoint,
        gtype: 'ft',
        showtype: 'live',
      });
      
      const response = await client.post(`/transform.php?ver=${config.version}`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
      });
      
      if (response.data && !response.data.includes('error') && !response.data.includes('Error')) {
        console.log(`✅ 找到端点: ${endpoint}`);
        console.log(`   响应: ${response.data.substring(0, 200)}`);
      }
    } catch (error) {
      // 忽略错误
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始分析皇冠实时数据推送机制\n');
  
  // 1. 登录
  const loggedIn = await login();
  if (!loggedIn) {
    console.error('❌ 登录失败，退出');
    return;
  }
  
  // 2. 测试数据更新频率
  await testUpdateFrequency();
  
  // 3. 探测其他 API
  await probeRealtimeAPIs();
  
  console.log('\n✅ 分析完成！');
}

main().catch(console.error);

