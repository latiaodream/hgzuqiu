/**
 * 测试代理功能
 * 用途：验证账号的代理配置是否生效
 */

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as https from 'https';

interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/**
 * 测试1: 不使用代理，获取本机IP
 */
async function testWithoutProxy() {
  console.log('\n=== 测试1: 不使用代理 ===');
  try {
    const response = await axios.get('https://api.ipify.org?format=json', {
      timeout: 10000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
    console.log('✅ 本机IP:', response.data.ip);
    return response.data.ip;
  } catch (error: any) {
    console.error('❌ 获取本机IP失败:', error.message);
    return null;
  }
}

/**
 * 测试2: 使用代理，获取代理IP
 */
async function testWithProxy(proxyConfig: ProxyConfig) {
  console.log('\n=== 测试2: 使用代理 ===');
  console.log(`代理地址: ${proxyConfig.host}:${proxyConfig.port}`);
  console.log(`代理认证: ${proxyConfig.username ? '是' : '否'}`);

  try {
    // 构建代理URL
    let proxyUrl: string;
    if (proxyConfig.username && proxyConfig.password) {
      proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
    } else {
      proxyUrl = `http://${proxyConfig.host}:${proxyConfig.port}`;
    }

    // 创建代理agent
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    // 发送请求
    const response = await axios.get('https://api.ipify.org?format=json', {
      timeout: 15000,
      httpsAgent: proxyAgent as any,
    });

    console.log('✅ 代理IP:', response.data.ip);
    return response.data.ip;
  } catch (error: any) {
    console.error('❌ 使用代理失败:', error.message);
    if (error.code) {
      console.error('   错误代码:', error.code);
    }
    return null;
  }
}

/**
 * 测试3: 使用代理访问皇冠站点
 */
async function testCrownWithProxy(proxyConfig: ProxyConfig) {
  console.log('\n=== 测试3: 使用代理访问皇冠站点 ===');

  try {
    // 构建代理URL
    let proxyUrl: string;
    if (proxyConfig.username && proxyConfig.password) {
      proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
    } else {
      proxyUrl = `http://${proxyConfig.host}:${proxyConfig.port}`;
    }

    // 创建代理agent
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    // 访问皇冠站点
    const crownUrl = 'https://hga050.com';
    console.log(`访问: ${crownUrl}`);

    const response = await axios.get(crownUrl, {
      timeout: 15000,
      httpsAgent: proxyAgent as any,
      validateStatus: () => true,
    });

    console.log('✅ 访问成功');
    console.log('   HTTP状态码:', response.status);
    console.log('   响应大小:', response.data.length, '字节');
    return true;
  } catch (error: any) {
    console.error('❌ 访问皇冠站点失败:', error.message);
    if (error.code) {
      console.error('   错误代码:', error.code);
    }
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🔍 开始测试代理功能...\n');

  // 账号 0TnQHLra61 的代理配置
  const proxyConfig: ProxyConfig = {
    host: '92.113.192.141',
    port: 43276,
    username: 'jBfJH0yBSdDgR1t',
    password: 'mEiIrAOJbzOW7F3',
  };

  // 测试1: 不使用代理
  const localIp = await testWithoutProxy();

  // 测试2: 使用代理
  const proxyIp = await testWithProxy(proxyConfig);

  // 测试3: 使用代理访问皇冠
  await testCrownWithProxy(proxyConfig);

  // 总结
  console.log('\n=== 测试总结 ===');
  if (localIp && proxyIp) {
    if (localIp === proxyIp) {
      console.log('⚠️  警告: 代理IP与本机IP相同，代理可能未生效！');
    } else {
      console.log('✅ 代理功能正常: IP已从', localIp, '切换到', proxyIp);
    }
  } else {
    console.log('❌ 测试失败: 无法获取IP信息');
  }
}

// 运行测试
main().catch(console.error);

