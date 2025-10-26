const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'lt',
  password: 'lt123456',
  database: 'bclogin_system'
});

async function testDirectAPI() {
  try {
    console.log('🔍 直接测试 Crown API...\n');
    
    // 1. 获取账号23的最新 uid
    console.log('📋 步骤1: 查询账号23的信息');
    const accountResult = await pool.query(
      'SELECT id, username, password FROM crown_accounts WHERE id = 23'
    );
    
    if (accountResult.rows.length === 0) {
      console.log('❌ 账号23不存在');
      return;
    }
    
    const account = accountResult.rows[0];
    console.log(`账号: ${account.username}\n`);
    
    // 2. 登录获取 uid
    console.log('📡 步骤2: 登录账号23获取 uid');
    const loginParams = new URLSearchParams({
      p: 'login',
      username: account.username,
      passwd: account.password,
      langx: 'zh-cn'
    });
    
    const loginResp = await axios.post(
      'https://hga050.com/transform.php?ver=2025-10-16-fix342_120',
      loginParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        validateStatus: () => true
      }
    );
    
    const loginData = loginResp.data;
    const uidMatch = loginData.match(/<uid>([^<]+)<\/uid>/);
    
    if (!uidMatch) {
      console.log('❌ 登录失败，无法获取 uid');
      console.log('响应类型:', typeof loginData);
      console.log('响应长度:', loginData.length);
      console.log('响应内容:', loginData);
      return;
    }
    
    const uid = uidMatch[1];
    console.log(`✅ 登录成功: uid=${uid}\n`);
    
    // 3. 调用 history_switch API
    console.log('📡 步骤3: 调用 history_switch API');
    const today = new Date();
    const todayGmt = today.toISOString().split('T')[0];
    
    const historyParams = new URLSearchParams({
      p: 'history_switch',
      uid: uid,
      langx: 'zh-cn',
      LS: 'c',
      today_gmt: todayGmt,
      gtype: 'ALL',
      tmp_flag: 'Y'
    });
    
    console.log(`请求参数: today_gmt=${todayGmt}`);
    
    const historyResp = await axios.post(
      'https://hga050.com/transform.php?ver=2025-10-16-fix342_120',
      historyParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        validateStatus: () => true
      }
    );
    
    const historyData = historyResp.data;
    console.log(`响应长度: ${historyData.length} 字符\n`);
    
    if (historyData.includes('doubleLogin')) {
      console.log('❌ 返回 doubleLogin 错误');
      return;
    }
    
    // 4. 解析注单
    console.log('📋 步骤4: 解析注单');
    const ticketMatches = historyData.matchAll(/OU(\d{11,})/g);
    const tickets = [];
    
    for (const match of ticketMatches) {
      const ticketId = match[0];
      const ticketSection = historyData.substring(match.index, Math.min(match.index + 1500, historyData.length));
      
      const goldMatch = ticketSection.match(/<gold>(-?[0-9]+(?:\.[0-9]+)?)<\/gold>/);
      const winGoldMatch = ticketSection.match(/<win_gold>(-?[0-9]+(?:\.[0-9]+)?)<\/win_gold>/);
      const scoreMatch = ticketSection.match(/<result_data>(\d+)\s*-\s*(\d+)<\/result_data>/);
      
      tickets.push({
        ticketId,
        gold: goldMatch?.[1],
        winGold: winGoldMatch?.[1],
        score: scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : ''
      });
    }
    
    console.log(`找到 ${tickets.length} 条注单:\n`);
    tickets.forEach(t => {
      console.log(`  - ${t.ticketId}: 投注=${t.gold}, 派彩=${t.winGold}, 比分=${t.score}`);
    });
    
    // 5. 查询我们的待结算注单
    console.log('\n📋 步骤5: 查询我们的待结算注单');
    const betsResult = await pool.query(`
      SELECT id, official_bet_id, bet_amount, account_id
      FROM bets 
      WHERE account_id = 23 AND status = 'confirmed' AND official_bet_id IS NOT NULL
      ORDER BY created_at DESC
    `);
    
    console.log(`我们有 ${betsResult.rows.length} 条待结算注单:\n`);
    betsResult.rows.forEach(bet => {
      const found = tickets.find(t => t.ticketId === `OU${bet.official_bet_id}`);
      if (found) {
        console.log(`  ✅ ${bet.official_bet_id}: 找到匹配 (派彩=${found.winGold})`);
      } else {
        console.log(`  ❌ ${bet.official_bet_id}: 未找到`);
      }
    });
    
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await pool.end();
  }
}

testDirectAPI();

