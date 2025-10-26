/**
 * 检查代理IP功能是否正常工作
 */
const { Pool } = require('pg');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bclogin_system',
  user: process.env.DB_USER || 'lt',
  password: process.env.DB_PASSWORD || ''
});

/**
 * 获取本机IP
 */
async function getLocalIP() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', {
      timeout: 10000
    });
    return response.data.ip;
  } catch (error) {
    console.error('❌ 获取本机IP失败:', error.message);
    return null;
  }
}

/**
 * 使用代理获取IP
 */
async function getProxyIP(proxyConfig) {
  try {
    let proxyAgent;
    const protocol = (proxyConfig.proxy_type || 'http').toLowerCase();
    
    if (protocol.includes('socks')) {
      // SOCKS5 代理
      const auth = proxyConfig.proxy_username && proxyConfig.proxy_password
        ? `${encodeURIComponent(proxyConfig.proxy_username)}:${encodeURIComponent(proxyConfig.proxy_password)}@`
        : '';
      const proxyUrl = `socks5://${auth}${proxyConfig.proxy_host}:${proxyConfig.proxy_port}`;
      proxyAgent = new SocksProxyAgent(proxyUrl);
    } else {
      // HTTP/HTTPS 代理
      const auth = proxyConfig.proxy_username && proxyConfig.proxy_password
        ? `${encodeURIComponent(proxyConfig.proxy_username)}:${encodeURIComponent(proxyConfig.proxy_password)}@`
        : '';
      const proxyUrl = `http://${auth}${proxyConfig.proxy_host}:${proxyConfig.proxy_port}`;
      proxyAgent = new HttpsProxyAgent(proxyUrl);
    }

    const response = await axios.get('https://api.ipify.org?format=json', {
      timeout: 15000,
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent
    });

    return response.data.ip;
  } catch (error) {
    console.error('❌ 使用代理获取IP失败:', error.message);
    return null;
  }
}

/**
 * 检查所有启用代理的账号
 */
async function checkProxyAccounts() {
  try {
    console.log('\n🔍 开始检查代理IP功能...\n');

    // 获取本机IP
    console.log('=== 步骤1: 获取本机IP ===');
    const localIP = await getLocalIP();
    if (localIP) {
      console.log('✅ 本机IP:', localIP);
    } else {
      console.log('❌ 无法获取本机IP');
    }

    // 查询所有启用代理的账号
    console.log('\n=== 步骤2: 查询启用代理的账号 ===');
    const result = await pool.query(`
      SELECT id, username, display_name, proxy_enabled, proxy_type, 
             proxy_host, proxy_port, proxy_username, 
             CASE WHEN proxy_password IS NOT NULL THEN '***' ELSE NULL END as proxy_password_masked
      FROM crown_accounts 
      WHERE proxy_enabled = true
      ORDER BY id
    `);

    if (result.rows.length === 0) {
      console.log('⚠️  没有找到启用代理的账号');
      return;
    }

    console.log(`✅ 找到 ${result.rows.length} 个启用代理的账号\n`);

    // 测试每个账号的代理
    console.log('=== 步骤3: 测试每个账号的代理 ===\n');
    
    for (const account of result.rows) {
      console.log(`\n📋 账号: ${account.username} (${account.display_name})`);
      console.log(`   代理类型: ${account.proxy_type}`);
      console.log(`   代理地址: ${account.proxy_host}:${account.proxy_port}`);
      console.log(`   代理用户: ${account.proxy_username || '无'}`);
      console.log(`   代理密码: ${account.proxy_password_masked || '无'}`);

      // 获取完整的代理配置（包括密码）
      const fullConfig = await pool.query(
        'SELECT proxy_type, proxy_host, proxy_port, proxy_username, proxy_password FROM crown_accounts WHERE id = $1',
        [account.id]
      );

      const proxyIP = await getProxyIP(fullConfig.rows[0]);
      
      if (proxyIP) {
        console.log(`   ✅ 代理IP: ${proxyIP}`);
        
        if (localIP && proxyIP === localIP) {
          console.log('   ⚠️  警告: 代理IP与本机IP相同，代理可能未生效！');
        } else if (localIP) {
          console.log(`   ✅ 代理正常: IP已从 ${localIP} 切换到 ${proxyIP}`);
        }
      } else {
        console.log('   ❌ 代理测试失败');
      }
    }

    // 总结
    console.log('\n=== 测试总结 ===');
    console.log(`✅ 本机IP: ${localIP || '未知'}`);
    console.log(`✅ 启用代理的账号数: ${result.rows.length}`);
    console.log('\n💡 提示:');
    console.log('   - 如果代理IP与本机IP相同，说明代理未生效');
    console.log('   - 请检查代理配置是否正确');
    console.log('   - 请确保代理服务器可访问');

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

// 运行检查
checkProxyAccounts();

