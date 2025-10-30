/**
 * iSportsAPI 测试脚本
 * 测试皇冠赔率数据获取
 */

import axios from 'axios';

const API_KEY = 'GvpziueL9ouzIJNj';
const BASE_URL = 'http://api.isportsapi.com/sport/football';

interface ISportsMatch {
  matchId: string;
  leagueId: string;
  leagueName: string;
  matchTime: number;
  status: number;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
}

interface ISportsOdds {
  matchId: string;
  companyId: number; // 3 = Crown
  handicap?: number;
  homeOdds?: number;
  awayOdds?: number;
  europeOdds?: {
    home: number;
    draw: number;
    away: number;
  };
  overUnder?: {
    line: number;
    over: number;
    under: number;
  };
}

/**
 * 获取今日赛程
 */
async function getSchedule() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `${BASE_URL}/schedule/basic?api_key=${API_KEY}&date=${today}`;
    
    console.log('📅 获取今日赛程...');
    console.log(`URL: ${url}`);
    
    const response = await axios.get(url);
    
    if (response.data.code === 0) {
      const matches = response.data.data as ISportsMatch[];
      console.log(`✅ 成功获取 ${matches.length} 场比赛`);
      
      // 显示前 5 场比赛
      console.log('\n前 5 场比赛：');
      matches.slice(0, 5).forEach((match, index) => {
        const time = new Date(match.matchTime * 1000).toLocaleString('zh-CN');
        console.log(`${index + 1}. [${match.leagueName}] ${match.homeName} vs ${match.awayName}`);
        console.log(`   时间: ${time}, 状态: ${match.status}, ID: ${match.matchId}`);
      });
      
      return matches;
    } else {
      console.error('❌ 获取赛程失败:', response.data.message);
      return [];
    }
  } catch (error: any) {
    console.error('❌ 请求失败:', error.message);
    return [];
  }
}

/**
 * 获取赛前赔率（主盘口）
 */
async function getPrematchOdds() {
  try {
    // 使用正确的 API 端点
    const url = `${BASE_URL}/odds/main?api_key=${API_KEY}`;

    console.log('\n📊 获取赛前赔率（主盘口）...');
    console.log(`URL: ${url}`);

    const response = await axios.get(url);

    if (response.data.code === 0) {
      console.log('✅ 成功获取赔率数据');

      const data = response.data.data;

      // 解析让球盘数据
      if (data.handicap && data.handicap.length > 0) {
        console.log(`\n📈 让球盘数据：共 ${data.handicap.length} 条`);

        // 查找皇冠赔率（companyId = 3）
        const crownHandicaps = data.handicap.filter((h: string) => {
          const parts = h.split(',');
          return parts[1] === '3'; // companyId = 3
        });

        if (crownHandicaps.length > 0) {
          console.log(`\n🎯 找到 ${crownHandicaps.length} 场比赛的皇冠让球盘赔率！`);
          console.log('\n前 3 场比赛的皇冠让球盘：');
          crownHandicaps.slice(0, 3).forEach((h: string, index: number) => {
            const parts = h.split(',');
            console.log(`${index + 1}. 比赛ID: ${parts[0]}`);
            console.log(`   初盘: ${parts[2]} @ ${parts[3]}/${parts[4]}`);
            console.log(`   即时: ${parts[5]} @ ${parts[6]}/${parts[7]}`);
            console.log(`   是否封盘: ${parts[11]}`);
          });
        } else {
          console.log('\n⚠️ 未找到皇冠让球盘赔率（companyId = 3）');
        }
      }

      // 解析独赢盘数据
      if (data.europeOdds && data.europeOdds.length > 0) {
        console.log(`\n📈 独赢盘数据：共 ${data.europeOdds.length} 条`);

        // 查找皇冠赔率（companyId = 3）
        const crownEuropeOdds = data.europeOdds.filter((e: string) => {
          const parts = e.split(',');
          return parts[1] === '3'; // companyId = 3
        });

        if (crownEuropeOdds.length > 0) {
          console.log(`\n🎯 找到 ${crownEuropeOdds.length} 场比赛的皇冠独赢盘赔率！`);
          console.log('\n前 3 场比赛的皇冠独赢盘：');
          crownEuropeOdds.slice(0, 3).forEach((e: string, index: number) => {
            const parts = e.split(',');
            console.log(`${index + 1}. 比赛ID: ${parts[0]}`);
            console.log(`   初盘: 主 ${parts[2]} / 平 ${parts[3]} / 客 ${parts[4]}`);
            console.log(`   即时: 主 ${parts[5]} / 平 ${parts[6]} / 客 ${parts[7]}`);
          });
        } else {
          console.log('\n⚠️ 未找到皇冠独赢盘赔率（companyId = 3）');
        }
      }

      // 解析大小球数据
      if (data.overUnder && data.overUnder.length > 0) {
        console.log(`\n📈 大小球数据：共 ${data.overUnder.length} 条`);

        // 查找皇冠赔率（companyId = 3）
        const crownOverUnder = data.overUnder.filter((o: string) => {
          const parts = o.split(',');
          return parts[1] === '3'; // companyId = 3
        });

        if (crownOverUnder.length > 0) {
          console.log(`\n🎯 找到 ${crownOverUnder.length} 场比赛的皇冠大小球赔率！`);
          console.log('\n前 3 场比赛的皇冠大小球：');
          crownOverUnder.slice(0, 3).forEach((o: string, index: number) => {
            const parts = o.split(',');
            console.log(`${index + 1}. 比赛ID: ${parts[0]}`);
            console.log(`   初盘: ${parts[2]} @ 大 ${parts[3]} / 小 ${parts[4]}`);
            console.log(`   即时: ${parts[5]} @ 大 ${parts[6]} / 小 ${parts[7]}`);
          });
        } else {
          console.log('\n⚠️ 未找到皇冠大小球赔率（companyId = 3）');
        }
      }

      return data;
    } else {
      console.error('❌ 获取赔率失败:', response.data.message);
      if (response.data.code === 2) {
        console.log('\n💡 提示：需要先订阅或申请免费试用');
        console.log('   1. 登录 https://www.isportsapi.com/');
        console.log('   2. 点击 "Start Free Trial"');
        console.log('   3. 选择 "Football - Odds" 产品');
        console.log('   4. 提交申请，等待审核通过');
      }
      return null;
    }
  } catch (error: any) {
    console.error('❌ 请求失败:', error.message);
    return null;
  }
}

/**
 * 获取滚球赔率
 */
async function getInplayOdds() {
  try {
    const url = `${BASE_URL}/odds/inplay?api_key=${API_KEY}`;
    
    console.log('\n⚽ 获取滚球赔率...');
    console.log(`URL: ${url}`);
    
    const response = await axios.get(url);
    
    if (response.data.code === 0) {
      const data = response.data.data;
      console.log(`✅ 成功获取 ${Array.isArray(data) ? data.length : 0} 场滚球比赛的赔率`);
      
      if (Array.isArray(data) && data.length > 0) {
        console.log('\n第一场滚球比赛的赔率：');
        console.log(JSON.stringify(data[0], null, 2));
      }
      
      return data;
    } else {
      console.error('❌ 获取滚球赔率失败:', response.data.message);
      return null;
    }
  } catch (error: any) {
    console.error('❌ 请求失败:', error.message);
    return null;
  }
}

/**
 * 获取实时赔率变化
 */
async function getLiveOddsChanges() {
  try {
    const url = `${BASE_URL}/odds/changes?api_key=${API_KEY}`;
    
    console.log('\n🔄 获取实时赔率变化（过去 20 秒）...');
    console.log(`URL: ${url}`);
    
    const response = await axios.get(url);
    
    if (response.data.code === 0) {
      const data = response.data.data;
      console.log(`✅ 成功获取 ${Array.isArray(data) ? data.length : 0} 条赔率变化`);
      
      if (Array.isArray(data) && data.length > 0) {
        console.log('\n最新的赔率变化：');
        console.log(JSON.stringify(data.slice(0, 3), null, 2));
      }
      
      return data;
    } else {
      console.error('❌ 获取赔率变化失败:', response.data.message);
      return null;
    }
  } catch (error: any) {
    console.error('❌ 请求失败:', error.message);
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('============================================================');
  console.log('🚀 iSportsAPI 测试');
  console.log('============================================================');
  console.log(`API Key: ${API_KEY}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('============================================================\n');

  // 1. 测试赛程 API
  const matches = await getSchedule();
  
  // 2. 测试赛前赔率 API
  await getPrematchOdds();
  
  // 3. 测试滚球赔率 API
  await getInplayOdds();
  
  // 4. 测试实时赔率变化 API
  await getLiveOddsChanges();
  
  console.log('\n============================================================');
  console.log('✅ 测试完成');
  console.log('============================================================');
}

// 运行测试
main().catch(console.error);

