// 测试通过后端的 CrownAutomation 实例来同步结算
const axios = require('axios');

async function testAutomation() {
  try {
    console.log('🔍 测试通过后端 API 同步结算...\n');
    
    // 直接调用后端的内部测试接口
    console.log('📡 调用后端测试接口...');
    const response = await axios.post('http://localhost:3001/api/test/sync-wagers', {
      accountId: 23
    }, {
      validateStatus: () => true
    });
    
    console.log('响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testAutomation();

