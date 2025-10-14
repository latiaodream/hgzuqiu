const axios = require('axios');

async function testCreditLimit() {
  try {
    console.log('===== 测试信用额度统计功能 =====\n');

    // 1. 管理员登录
    console.log('1. 管理员登录...');
    const loginRes = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'admin',
      password: '123456'
    });

    if (!loginRes.data.success) {
      console.log('❌ 登录失败:', loginRes.data.error);
      return;
    }

    const token = loginRes.data.data.token;
    console.log('✅ 登录成功\n');

    // 2. 获取代理列表，查看信用额度
    console.log('2. 获取代理列表...');
    const agentsRes = await axios.get('http://localhost:3001/api/agents', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (agentsRes.data.success) {
      console.log('✅ 代理列表获取成功');
      console.log('代理信息:');
      agentsRes.data.data.forEach(agent => {
        console.log(`  - ID: ${agent.id}, 用户名: ${agent.username}, 信用额度: ${agent.credit_limit || 0}`);
      });
      console.log('');
    } else {
      console.log('❌ 获取代理列表失败:', agentsRes.data.error);
      return;
    }

    // 3. 获取员工列表，查看信用额度
    console.log('3. 获取员工列表...');
    const staffRes = await axios.get('http://localhost:3001/api/staff', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (staffRes.data.success) {
      console.log('✅ 员工列表获取成功');
      console.log('员工信息:');
      staffRes.data.data.forEach(staff => {
        console.log(`  - ID: ${staff.id}, 用户名: ${staff.username}, 信用额度: ${staff.credit_limit || 0}`);
      });
      console.log('');
    } else {
      console.log('❌ 获取员工列表失败:', staffRes.data.error);
      return;
    }

    // 4. 验证信用额度计算是否正确（获取皇冠账号列表并手动计算）
    console.log('4. 验证信用额度计算...');
    const accountsRes = await axios.get('http://localhost:3001/api/accounts', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (accountsRes.data.success) {
      const accounts = accountsRes.data.data;
      console.log('✅ 皇冠账号列表获取成功');

      // 按用户ID分组计算余额总和
      const creditByUser = {};
      accounts.forEach(acc => {
        if (!creditByUser[acc.user_id]) {
          creditByUser[acc.user_id] = 0;
        }
        creditByUser[acc.user_id] += (acc.balance || 0);
      });

      console.log('手动计算的信用额度:');
      Object.keys(creditByUser).forEach(userId => {
        const staff = staffRes.data.data.find(s => s.id === parseInt(userId));
        if (staff) {
          console.log(`  - 员工 ${staff.username} (ID: ${userId}): ${creditByUser[userId]}`);

          // 验证是否一致
          if (Math.abs(staff.credit_limit - creditByUser[userId]) < 0.01) {
            console.log('    ✅ 信用额度计算正确');
          } else {
            console.log(`    ❌ 信用额度不匹配！API返回: ${staff.credit_limit}, 手动计算: ${creditByUser[userId]}`);
          }
        }
      });
      console.log('');
    } else {
      console.log('❌ 获取皇冠账号列表失败:', accountsRes.data.error);
    }

    console.log('===== 测试完成 =====');

  } catch (error) {
    console.error('❌ 测试出错:', error.response?.data || error.message);
  }
}

testCreditLimit();
