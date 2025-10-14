const axios = require('axios');

async function testNewAgent() {
  try {
    console.log('测试新增代理账号 latiao 登录...\n');

    const loginRes = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'latiao',
      password: '123456'
    });

    if (loginRes.data.success) {
      console.log('✅ 登录成功!');
      console.log('用户信息:', JSON.stringify(loginRes.data.data.user, null, 2));
      console.log('Token:', loginRes.data.data.token.substring(0, 20) + '...');
    } else {
      console.log('❌ 登录失败:', loginRes.data.error);
    }
  } catch (error) {
    console.log('❌ 登录错误:', error.response?.data?.error || error.message);
  }
}

testNewAgent();
