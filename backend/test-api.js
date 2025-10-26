// 简单测试：直接调用 getTodayWagers API
const axios = require('axios');

async function test() {
  try {
    // 测试账号23的 getTodayWagers API
    const accountId = 23;
    const uid = 'd3ayxs1dfm39199455l185312b0'; // 从后端日志中获取的最新 uid
    
    console.log(`🔍 测试账号 ${accountId} 的 getTodayWagers API...`);
    console.log(`   uid: ${uid}`);
    
    // 获取今天的日期
    const today = new Date();
    const todayGmt = today.toISOString().split('T')[0];
    console.log(`   日期: ${todayGmt}`);
    
    // 构造请求参数
    const params = new URLSearchParams({
      p: 'history_switch',
      uid: uid,
      langx: 'zh-cn',
      LS: 'c', // c = 已结算的注单
      today_gmt: todayGmt,
      gtype: 'ALL',
      tmp_flag: 'Y'
    });
    
    console.log(`\n📡 发送请求到 https://hga050.com/transform.php...`);
    
    const response = await axios.post(
      'https://hga050.com/transform.php?ver=2025-10-16-fix342_120',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }
    );
    
    const data = response.data;
    console.log(`\n📄 响应长度: ${data.length} 字符`);

    // 保存完整响应到文件
    const fs = require('fs');
    fs.writeFileSync('test-api-response.xml', data);
    console.log(`📄 完整响应已保存到 test-api-response.xml`);

    // 解析注单号
    const ticketMatches = [...data.matchAll(/OU(\d{11,})/g)];
    console.log(`\n✅ 找到 ${ticketMatches.length} 个注单号`);

    // 检查是否包含我们的注单号
    const ourTickets = ['22864082875', '22864082884', '22863364556', '22863362988', '22862741412'];
    console.log(`\n🔍 检查我们的注单号:`);
    for (const ticket of ourTickets) {
      const found = data.includes(`OU${ticket}`);
      if (found) {
        console.log(`   - OU${ticket}: ✅ 找到`);

        // 提取该注单的详细信息
        const ticketSection = data.substring(
          data.indexOf(`OU${ticket}`),
          data.indexOf(`OU${ticket}`) + 2000
        );

        // 提取金额、派彩、比分等信息
        const goldMatch = ticketSection.match(/<gold>([\d.]+)<\/gold>/);
        const winGoldMatch = ticketSection.match(/<winGold>([\d.-]+)<\/winGold>/);
        const ballActRetMatch = ticketSection.match(/<ballActRet>([^<]*)<\/ballActRet>/);
        const resultMatch = ticketSection.match(/<result>([^<]*)<\/result>/);

        console.log(`      投注金额: ${goldMatch ? goldMatch[1] : 'N/A'}`);
        console.log(`      派彩金额: ${winGoldMatch ? winGoldMatch[1] : 'N/A'}`);
        console.log(`      比分: ${ballActRetMatch ? ballActRetMatch[1] : 'N/A'}`);
        console.log(`      结果: ${resultMatch ? resultMatch[1] : 'N/A'}`);
      } else {
        console.log(`   - OU${ticket}: ❌ 未找到`);
      }
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', error.response.data);
    }
  }
}

test();

