const axios = require('axios');

const API_KEY = 'GvpziueL9ouzIJNj'; // 你的 API Key
const BASE_URL = 'http://api.isportsapi.com/sport/football';

async function testAPI() {
  console.log('========================================');
  console.log('测试 iSportsAPI 接口');
  console.log('========================================\n');

  const today = new Date().toISOString().split('T')[0];

  // 1. 测试 /schedule/basic (id=42)
  console.log('1️⃣  测试 /schedule/basic (id=42) - 获取基本赛程');
  console.log('   请求参数: date=' + today);
  try {
    const response = await axios.get(`${BASE_URL}/schedule/basic`, {
      params: { api_key: API_KEY, date: today },
      timeout: 10000,
    });
    console.log('   ✅ 状态码:', response.data.code);
    console.log('   ✅ 消息:', response.data.message);
    if (response.data.code === 0 && response.data.data && response.data.data.length > 0) {
      console.log('   ✅ 比赛数量:', response.data.data.length);
      console.log('   ✅ 第一场比赛数据:');
      console.log(JSON.stringify(response.data.data[0], null, 2));
    } else {
      console.log('   ⚠️  返回数据:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.log('   ❌ 错误:', error.message);
  }
  console.log('\n');

  // 2. 测试 /schedule (id=41)
  console.log('2️⃣  测试 /schedule (id=41) - 获取详细赛程');
  console.log('   请求参数: date=' + today);
  try {
    const response = await axios.get(`${BASE_URL}/schedule`, {
      params: { api_key: API_KEY, date: today },
      timeout: 10000,
    });
    console.log('   ✅ 状态码:', response.data.code);
    console.log('   ✅ 消息:', response.data.message);
    if (response.data.code === 0 && response.data.data && response.data.data.length > 0) {
      console.log('   ✅ 比赛数量:', response.data.data.length);
      console.log('   ✅ 第一场比赛数据:');
      console.log(JSON.stringify(response.data.data[0], null, 2));
    } else {
      console.log('   ⚠️  返回数据:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.log('   ❌ 错误:', error.message);
  }
  console.log('\n');

  // 3. 测试 /league (id=33)
  console.log('3️⃣  测试 /league (id=33) - 获取联赛列表');
  console.log('   请求参数: date=' + today);
  try {
    const response = await axios.get(`${BASE_URL}/league`, {
      params: { api_key: API_KEY, date: today },
      timeout: 10000,
    });
    console.log('   ✅ 状态码:', response.data.code);
    console.log('   ✅ 消息:', response.data.message);
    if (response.data.code === 0 && response.data.data && response.data.data.length > 0) {
      console.log('   ✅ 联赛数量:', response.data.data.length);
      console.log('   ✅ 前3个联赛数据:');
      console.log(JSON.stringify(response.data.data.slice(0, 3), null, 2));
    } else {
      console.log('   ⚠️  返回数据:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.log('   ❌ 错误:', error.message);
  }
  console.log('\n');

  console.log('========================================');
  console.log('测试完成');
  console.log('========================================');
}

testAPI();

