const axios = require('axios');

const API_URL = 'http://localhost:3001/api';

async function testRole(username, password) {
  try {
    console.log(`\n========== 测试 ${username} 账号 ==========`);

    // 登录
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      username,
      password
    });

    if (!loginRes.data.success) {
      console.log(`❌ 登录失败: ${loginRes.data.error}`);
      return;
    }

    const { token, user } = loginRes.data.data;
    console.log(`✅ 登录成功`);
    console.log(`   用户: ${user.username}`);
    console.log(`   角色: ${user.role}`);
    console.log(`   ID: ${user.id}`);

    // 根据角色显示应该看到的菜单
    console.log(`\n📋 应该看到的菜单:`);
    console.log(`   - 看板`);

    if (user.role === 'admin') {
      console.log(`   - 代理管理 (admin专属)`);
      console.log(`   - 员工管理`);
    } else if (user.role === 'agent') {
      console.log(`   - 员工管理 (agent专属)`);
    }

    // 所有角色都有的业务功能
    console.log(`   - 账号管理`);
    console.log(`   - 抓取账号`);
    console.log(`   - 票单`);
    console.log(`   - 赛事`);
    console.log(`   - 金币`);
    console.log(`   - 设置`);

    // 测试API权限
    console.log(`\n🔐 API权限测试:`);

    // 测试代理管理API
    try {
      const agentsRes = await axios.get(`${API_URL}/agents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`   ✅ 代理管理API: 可访问 (${agentsRes.data.data?.length || 0}个代理)`);
    } catch (err) {
      console.log(`   ❌ 代理管理API: ${err.response?.status === 403 ? '无权限(正常)' : '错误'}`);
    }

    // 测试员工管理API
    try {
      const staffRes = await axios.get(`${API_URL}/staff`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`   ✅ 员工管理API: 可访问 (${staffRes.data.data?.length || 0}个员工)`);
    } catch (err) {
      console.log(`   ❌ 员工管理API: ${err.response?.status === 403 ? '无权限(正常)' : '错误'}`);
    }

  } catch (error) {
    console.log(`❌ 错误: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 开始测试三个角色的权限...\n');

  await testRole('admin', '123456');
  await testRole('agent', '123456');
  await testRole('test1', '123456');

  console.log('\n✅ 测试完成!\n');
}

main();
