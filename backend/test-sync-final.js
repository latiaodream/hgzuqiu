const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'lt',
  password: 'lt123456',
  database: 'bclogin_system'
});

async function testSync() {
  try {
    console.log('🔍 开始测试同步结算功能...\n');
    
    // 1. 查询待结算的注单
    console.log('📋 步骤1: 查询待结算的注单');
    const betsResult = await pool.query(`
      SELECT id, account_id, official_bet_id, bet_amount, status, result
      FROM bets 
      WHERE status = 'confirmed' AND official_bet_id IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log(`找到 ${betsResult.rows.length} 条待结算注单:\n`);
    betsResult.rows.forEach(bet => {
      console.log(`  - ID: ${bet.id}, 账号: ${bet.account_id}, 单号: ${bet.official_bet_id}, 金额: ${bet.bet_amount}`);
    });
    
    if (betsResult.rows.length === 0) {
      console.log('\n✅ 没有待结算的注单');
      return;
    }
    
    // 2. 调用后端API同步结算
    console.log('\n📡 步骤2: 调用后端API同步结算');
    const axios = require('axios');
    
    // 先登录获取token
    console.log('🔐 登录管理员账号...');
    const loginRes = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log('✅ 登录成功\n');
    
    // 调用同步API
    console.log('🔄 调用同步结算API...');
    const syncRes = await axios.post(
      'http://localhost:3001/api/bets/sync-settlements',
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('\n📊 同步结果:');
    console.log(JSON.stringify(syncRes.data, null, 2));
    
    // 3. 再次查询注单状态
    console.log('\n📋 步骤3: 查询同步后的注单状态');
    const afterResult = await pool.query(`
      SELECT id, account_id, official_bet_id, bet_amount, status, result, payout, profit_loss
      FROM bets 
      WHERE id = ANY($1)
    `, [betsResult.rows.map(b => b.id)]);
    
    console.log('\n同步后的注单状态:\n');
    afterResult.rows.forEach(bet => {
      console.log(`  - ID: ${bet.id}, 账号: ${bet.account_id}, 单号: ${bet.official_bet_id}`);
      console.log(`    状态: ${bet.status}, 结果: ${bet.result || '未结算'}`);
      console.log(`    派彩: ${bet.payout || 'N/A'}, 盈亏: ${bet.profit_loss || 'N/A'}\n`);
    });
    
    console.log('✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  } finally {
    await pool.end();
  }
}

testSync();

