import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { CrownClient } from './crown-client';

// 加载环境变量
dotenv.config();

const config = {
  username: process.env.CROWN_USERNAME || '',
  password: process.env.CROWN_PASSWORD || '',
  baseUrl: process.env.CROWN_BASE_URL || 'https://hga026.com',
  fetchInterval: parseInt(process.env.FETCH_INTERVAL || '1000'),
  sessionCheckInterval: parseInt(process.env.SESSION_CHECK_INTERVAL || '300000'),
  dataDir: process.env.DATA_DIR || './data',
};

// 验证配置
if (!config.username || !config.password) {
  console.error('❌ 缺少必要配置: CROWN_USERNAME 和 CROWN_PASSWORD');
  process.exit(1);
}

// 创建数据目录
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

// 创建客户端
const client = new CrownClient({
  baseUrl: config.baseUrl,
  username: config.username,
  password: config.password,
  dataDir: config.dataDir,
});

// 统计信息
let stats = {
  startTime: Date.now(),
  totalFetches: 0,
  successFetches: 0,
  failedFetches: 0,
  lastFetchTime: 0,
  lastMatchCount: 0,
  loginCount: 0,
};

/**
 * 主抓取循环
 */
async function fetchLoop() {
  try {
    // 确保已登录
    const loggedIn = await client.ensureLoggedIn();
    if (!loggedIn) {
      console.error('❌ 登录失败，等待下次重试...');
      stats.failedFetches++;
      return;
    }

    // 抓取赛事
    const result = await client.fetchMatches();
    stats.totalFetches++;
    stats.lastFetchTime = Date.now();

    if (result.success) {
      stats.successFetches++;
      stats.lastMatchCount = result.matches.length;

      // 保存数据到文件
      const dataFile = path.join(config.dataDir, 'latest-matches.json');
      fs.writeFileSync(
        dataFile,
        JSON.stringify({
          timestamp: result.timestamp,
          matches: result.matches,
          matchCount: result.matches.length,
        })
      );

      console.log(
        `✅ [${new Date().toLocaleTimeString()}] 抓取成功 | 比赛数: ${result.matches.length} | 成功率: ${((stats.successFetches / stats.totalFetches) * 100).toFixed(1)}%`
      );
    } else {
      stats.failedFetches++;
      console.error(`❌ [${new Date().toLocaleTimeString()}] 抓取失败: ${result.error}`);
    }
  } catch (error: any) {
    stats.failedFetches++;
    console.error(`❌ [${new Date().toLocaleTimeString()}] 抓取异常:`, error.message);
  }
}

/**
 * 定期检查会话
 */
async function sessionCheckLoop() {
  try {
    const isValid = await client.checkSession();
    if (!isValid) {
      console.log('⚠️ 会话失效，将在下次抓取时重新登录');
    } else {
      console.log(`✅ [${new Date().toLocaleTimeString()}] 会话有效`);
    }
  } catch (error: any) {
    console.error('❌ 会话检查失败:', error.message);
  }
}

/**
 * 打印统计信息
 */
function printStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  console.log('\n' + '='.repeat(60));
  console.log('📊 运行统计');
  console.log('='.repeat(60));
  console.log(`⏱️  运行时长: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
  console.log(`📈 总抓取次数: ${stats.totalFetches}`);
  console.log(`✅ 成功次数: ${stats.successFetches}`);
  console.log(`❌ 失败次数: ${stats.failedFetches}`);
  console.log(`📊 成功率: ${stats.totalFetches > 0 ? ((stats.successFetches / stats.totalFetches) * 100).toFixed(1) : 0}%`);
  console.log(`🔐 登录次数: ${stats.loginCount}`);
  console.log(`⚽ 最新比赛数: ${stats.lastMatchCount}`);
  console.log(`🕐 最后抓取: ${stats.lastFetchTime > 0 ? new Date(stats.lastFetchTime).toLocaleString() : '未开始'}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * 启动服务
 */
async function start() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 皇冠赛事抓取服务启动');
  console.log('='.repeat(60));
  console.log(`📍 站点: ${config.baseUrl}`);
  console.log(`👤 账号: ${config.username}`);
  console.log(`⏱️  抓取间隔: ${config.fetchInterval}ms`);
  console.log(`🔍 会话检查间隔: ${config.sessionCheckInterval}ms`);
  console.log(`💾 数据目录: ${config.dataDir}`);
  console.log('='.repeat(60) + '\n');

  // 初始登录
  console.log('🔐 初始登录...');
  const loginResult = await client.login();
  if (loginResult.success) {
    stats.loginCount++;
    console.log('✅ 初始登录成功\n');
  } else {
    console.error(`❌ 初始登录失败: ${loginResult.error}`);
    console.error('⚠️ 将在抓取时重试登录\n');
  }

  // 启动抓取循环
  setInterval(fetchLoop, config.fetchInterval);

  // 启动会话检查循环
  setInterval(sessionCheckLoop, config.sessionCheckInterval);

  // 每分钟打印一次统计信息
  setInterval(printStats, 60000);

  // 立即执行一次抓取
  fetchLoop();
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n⚠️ 收到退出信号，正在保存数据...');
  printStats();
  console.log('👋 服务已停止\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️ 收到终止信号，正在保存数据...');
  printStats();
  console.log('👋 服务已停止\n');
  process.exit(0);
});

// 启动
start().catch((error) => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});

