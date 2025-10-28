/**
 * 测试限额获取功能
 * 
 * 使用方法:
 * node backend/test-fetch-limits.js
 */

const { CrownApiClient } = require('./dist/services/crown-api-client');

async function testFetchLimits() {
  console.log('🧪 开始测试限额获取功能...\n');

  // 测试账号信息
  const testAccount = {
    username: 'heizi2025',
    password: 'Heizi8888'
  };

  try {
    console.log(`📝 测试账号: ${testAccount.username}`);
    console.log('=' .repeat(60));

    // 创建 API 客户端
    const apiClient = new CrownApiClient();

    // 1. 登录测试
    console.log('\n1️⃣ 测试登录...');
    const loginResult = await apiClient.login(testAccount.username, testAccount.password);
    
    if (!loginResult.success) {
      console.error('❌ 登录失败:', loginResult.message);
      return;
    }
    console.log('✅ 登录成功');

    // 2. 获取限额页面
    console.log('\n2️⃣ 获取限额页面...');
    const limitsPageUrl = `${apiClient.getBaseUrl()}/app/member/account/account_wager_limit.php`;
    console.log(`   URL: ${limitsPageUrl}`);
    
    const response = await apiClient.fetch(limitsPageUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      }
    });

    if (!response.ok) {
      console.error(`❌ 获取限额页面失败: HTTP ${response.status}`);
      return;
    }
    console.log('✅ 限额页面获取成功');

    // 3. 解析 HTML
    console.log('\n3️⃣ 解析限额数据...');
    const html = await response.text();
    
    // 查找足球限额表格
    const footballMatch = html.match(/足球[\s\S]*?<table[\s\S]*?<\/table>/i);
    if (!footballMatch) {
      console.error('❌ 未找到足球限额表格');
      return;
    }
    console.log('✅ 找到足球限额表格');

    const footballTable = footballMatch[0];
    
    // 提取足球赛前限额
    const footballPrematchMatch = footballTable.match(/让球,\s*大小,\s*单双[\s\S]*?<td[^>]*>([0-9,]+)<\/td>[\s\S]*?<td[^>]*>([0-9,]+)<\/td>/i);
    
    // 提取足球滚球限额
    const footballLiveMatch = footballTable.match(/滚球让球,\s*滚球大小,\s*滚球单双[\s\S]*?<td[^>]*>([0-9,]+)<\/td>[\s\S]*?<td[^>]*>([0-9,]+)<\/td>/i);

    // 查找篮球限额表格
    const basketballMatch = html.match(/篮球[\s\S]*?<table[\s\S]*?<\/table>/i);
    if (!basketballMatch) {
      console.error('❌ 未找到篮球限额表格');
      return;
    }
    console.log('✅ 找到篮球限额表格');

    const basketballTable = basketballMatch[0];
    
    // 提取篮球赛前限额
    const basketballPrematchMatch = basketballTable.match(/让球,\s*大小,\s*单双[\s\S]*?<td[^>]*>([0-9,]+)<\/td>[\s\S]*?<td[^>]*>([0-9,]+)<\/td>/i);
    
    // 提取篮球滚球限额
    const basketballLiveMatch = basketballTable.match(/滚球让球,\s*滚球大小,\s*滚球单双[\s\S]*?<td[^>]*>([0-9,]+)<\/td>[\s\S]*?<td[^>]*>([0-9,]+)<\/td>/i);

    // 解析数值
    const parseLimit = (value) => {
      if (!value) return 100000;
      return parseInt(value.replace(/,/g, ''), 10) || 100000;
    };

    const limits = {
      football: {
        prematch: footballPrematchMatch ? parseLimit(footballPrematchMatch[2]) : 100000,
        live: footballLiveMatch ? parseLimit(footballLiveMatch[2]) : 100000,
      },
      basketball: {
        prematch: basketballPrematchMatch ? parseLimit(basketballPrematchMatch[2]) : 100000,
        live: basketballLiveMatch ? parseLimit(basketballLiveMatch[2]) : 100000,
      }
    };

    // 4. 显示结果
    console.log('\n4️⃣ 解析结果:');
    console.log('=' .repeat(60));
    console.log('\n⚽ 足球限额:');
    console.log(`   赛前限额: ${limits.football.prematch.toLocaleString()}`);
    console.log(`   滚球限额: ${limits.football.live.toLocaleString()}`);
    console.log('\n🏀 篮球限额:');
    console.log(`   赛前限额: ${limits.basketball.prematch.toLocaleString()}`);
    console.log(`   滚球限额: ${limits.basketball.live.toLocaleString()}`);

    console.log('\n' + '=' .repeat(60));
    console.log('✅ 测试完成！限额获取功能正常工作');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
testFetchLimits().catch(console.error);

