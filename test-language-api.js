/**
 * 测试 iSportsAPI 语言包 API
 */

const axios = require('axios');

const API_KEY = process.env.ISPORTS_API_KEY || 'GvpziueL9ouzIJNj';
const BASE_URL = 'http://api.isportsapi.com/sport';

async function testLanguageAPI() {
  console.log('============================================================');
  console.log('🧪 测试 iSportsAPI 语言包 API');
  console.log('============================================================');
  console.log(`API Key: ${API_KEY}`);
  console.log('');

  try {
    console.log('📥 获取繁体中文语言包...');
    const response = await axios.get(`${BASE_URL}/languagetc`, {
      params: {
        api_key: API_KEY,
        sport: 'football',
      },
      timeout: 30000,
    });

    console.log('✅ 响应状态码:', response.data.code);
    console.log('✅ 响应消息:', response.data.message);

    if (response.data.code === 0) {
      const data = response.data.data[0] || {};
      
      console.log('');
      console.log('📊 数据统计:');
      console.log(`   联赛数量: ${data.leagues?.length || 0}`);
      console.log(`   球队数量: ${data.teams?.length || 0}`);
      console.log(`   球员数量: ${data.players?.length || 0}`);

      if (data.leagues && data.leagues.length > 0) {
        console.log('');
        console.log('🏆 前 10 个联赛:');
        data.leagues.slice(0, 10).forEach((league, index) => {
          console.log(`   ${index + 1}. [${league.leagueId}] ${league.name_tc}`);
        });
      }

      if (data.teams && data.teams.length > 0) {
        console.log('');
        console.log('⚽ 前 10 个球队:');
        data.teams.slice(0, 10).forEach((team, index) => {
          console.log(`   ${index + 1}. [${team.teamId}] ${team.name_tc}`);
        });
      }

      console.log('');
      console.log('✅ 语言包 API 测试成功！');
      console.log('');
      console.log('💡 提示:');
      console.log('   - 语言包数据会被缓存到 fetcher-isports/data/language-cache.json');
      console.log('   - 缓存有效期为 24 小时');
      console.log('   - 使用繁体中文名称可以大幅提高与皇冠赛事的匹配率');
    } else {
      console.error('❌ 获取语言包失败:', response.data);
      if (response.data.code === 2) {
        console.error('');
        console.error('⚠️  可能的原因:');
        console.error('   1. API Key 无效或已过期');
        console.error('   2. 未订阅 Language Packs 套餐');
        console.error('   3. API 调用次数已超出限制');
        console.error('');
        console.error('💡 解决方案:');
        console.error('   - 登录 https://www.isportsapi.com/');
        console.error('   - 检查 API Key 是否正确');
        console.error('   - 确认已订阅 Language Packs 套餐');
      }
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', error.response.data);
    }
  }

  console.log('');
  console.log('============================================================');
}

testLanguageAPI();

