const axios = require('axios');

async function testStatsAPI() {
  try {
    console.log('1. 测试管理员登录...');
    const loginRes = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'admin',
      password: '123456'
    });

    if (!loginRes.data.success) {
      console.log('❌ 登录失败:', loginRes.data.error);
      return;
    }

    const token = loginRes.data.data.token;
    console.log('✅ 登录成功, Token:', token.substring(0, 20) + '...');

    console.log('\n2. 测试 /bets/stats 接口...');
    const statsRes = await axios.get('http://localhost:3001/api/bets/stats', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      }
    });

    console.log('✅ 接口响应:', JSON.stringify(statsRes.data, null, 2));

  } catch (error) {
    console.log('❌ 错误:', error.response?.data || error.message);
  }
}

testStatsAPI();
