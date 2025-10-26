#!/usr/bin/env node

/**
 * 皇冠账户历史数据同步脚本
 * 用于宝塔定时任务，每天凌晨2点执行
 * 
 * 使用方法：
 * 1. 在宝塔面板 -> 计划任务 -> Shell脚本
 * 2. 执行周期：每天 02:00
 * 3. 脚本内容：cd /www/wwwroot/bclogin-system && node scripts/sync-history.js
 * 
 * 或者直接运行：
 * node /www/wwwroot/bclogin-system/scripts/sync-history.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 配置
const PROJECT_DIR = path.resolve(__dirname, '..');
const LOG_DIR = path.join(PROJECT_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, `sync-history-${new Date().toISOString().split('T')[0]}.log`);

// 数据库配置
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bclogin_system',
  user: process.env.DB_USER || 'lt',
  password: process.env.DB_PASSWORD || 'lt123456',
});

// 创建日志目录
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志函数
function log(message) {
  const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_FILE, logMessage);
}

// 获取昨天的日期
function getYesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

// 主函数
async function main() {
  log('=========================================');
  log('开始同步昨天的历史数据');
  log('=========================================');

  const yesterday = getYesterday();
  log(`同步日期: ${yesterday}`);

  try {
    // 获取所有在线账号
    log('正在查询在线账号...');
    const accountsResult = await pool.query(`
      SELECT id, username 
      FROM crown_accounts 
      WHERE is_enabled = true AND is_online = true
      ORDER BY id
    `);

    const accounts = accountsResult.rows;

    if (accounts.length === 0) {
      log('❌ 没有找到在线账号');
      return;
    }

    log(`找到 ${accounts.length} 个在线账号`);
    log('-----------------------------------------');

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    // 遍历每个账号
    for (const account of accounts) {
      log(`处理账号: ${account.username} (ID: ${account.id})`);

      try {
        // 检查数据库中是否已有该日期的数据
        const existingResult = await pool.query(
          'SELECT COUNT(*) as count FROM account_history WHERE account_id = $1 AND date = $2',
          [account.id, yesterday]
        );

        if (parseInt(existingResult.rows[0].count) > 0) {
          log('  ⏭️  跳过: 数据已存在');
          skipCount++;
          continue;
        }

        // 调用API获取历史数据
        log('  📡 正在从皇冠API获取数据...');
        
        // 动态导入服务（需要编译后的代码）
        const { getCrownAutomation } = require(path.join(PROJECT_DIR, 'backend/dist/services/crown-automation'));
        
        const automation = getCrownAutomation();
        const result = await automation.getAccountHistory(account.id, {
          startDate: yesterday,
          endDate: yesterday
        });

        if (result.success && result.data && result.data.length > 0) {
          log(`  ✅ 同步成功: ${result.data.length} 条记录`);
          successCount++;
        } else {
          log('  ⚠️  无数据');
          skipCount++;
        }

      } catch (error) {
        log(`  ❌ 同步失败: ${error.message}`);
        failCount++;
      }

      // 延迟2秒，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    log('-----------------------------------------');
    log('同步完成！');
    log(`总账号数: ${accounts.length}`);
    log(`成功: ${successCount}`);
    log(`跳过: ${skipCount}`);
    log(`失败: ${failCount}`);
    log('=========================================');

  } catch (error) {
    log(`❌ 执行失败: ${error.message}`);
    log(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }

  // 清理7天前的日志
  try {
    const files = fs.readdirSync(LOG_DIR);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    files.forEach(file => {
      if (file.startsWith('sync-history-') && file.endsWith('.log')) {
        const filePath = path.join(LOG_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < sevenDaysAgo) {
          fs.unlinkSync(filePath);
          log(`清理旧日志: ${file}`);
        }
      }
    });
  } catch (error) {
    log(`清理日志失败: ${error.message}`);
  }
}

// 运行
main().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});

