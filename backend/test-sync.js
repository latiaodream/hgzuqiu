// 测试同步结算脚本
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bclogin_system',
  user: process.env.DB_USER || 'lt',
  password: process.env.DB_PASSWORD || 'lt123456'
});

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

// 导入 CrownAutomation
const { getCrownAutomation } = require('./dist/services/crown-automation');

async function testSync() {
  try {
    console.log('🔄 [测试] 开始测试同步结算...');
    
    // 获取待结算的注单
    const result = await query(`
      SELECT b.*, ca.discount
      FROM bets b
      JOIN crown_accounts ca ON ca.id = b.account_id
      WHERE b.status IN ('confirmed', 'pending')
        AND b.official_bet_id IS NOT NULL
        AND b.official_bet_id != ''
      ORDER BY b.created_at ASC
      LIMIT 5
    `);

    const bets = result.rows;
    console.log(`📊 发现 ${bets.length} 条待结算的注单（仅测试前5条）`);

    if (bets.length === 0) {
      console.log('ℹ️  没有需要同步结算的注单');
      await pool.end();
      return;
    }

    const automation = getCrownAutomation();

    // 按账号分组
    const betsByAccount = new Map();
    for (const bet of bets) {
      const accountId = Number(bet.account_id);
      if (!betsByAccount.has(accountId)) {
        betsByAccount.set(accountId, []);
      }
      betsByAccount.get(accountId).push(bet);
    }

    console.log(`📋 涉及 ${betsByAccount.size} 个账号`);

    // 逐账号处理
    for (const [accountId, accountBets] of betsByAccount.entries()) {
      console.log(`\n🔍 处理账号 ${accountId} 的 ${accountBets.length} 条注单...`);
      
      if (!automation.isAccountOnline(accountId)) {
        console.log(`⚠️  账号 ${accountId} 未在线，跳过`);
        continue;
      }

      try {
        // 调用新的 getTodayWagers API
        const wagersResult = await automation.fetchTodayWagers(accountId);
        
        if (!wagersResult.success) {
          console.log(`❌ 账号 ${accountId} 获取注单失败: ${wagersResult.error}`);
          continue;
        }

        const wagers = wagersResult.items || [];
        console.log(`✅ 账号 ${accountId} 获取到 ${wagers.length} 条注单`);

        // 显示前3条注单信息
        for (let i = 0; i < Math.min(3, wagers.length); i++) {
          const w = wagers[i];
          console.log(`   注单 ${i + 1}: ${w.ticketId}, 金额=${w.gold}, 派彩=${w.winGold}, 结果=${w.resultText}`);
        }

        // 匹配并更新注单
        for (const bet of accountBets) {
          const ticketId = String(bet.official_bet_id);
          const wager = wagers.find(w => w.ticketId === ticketId);
          
          if (!wager) {
            console.log(`⚠️  注单 ${ticketId} 未在皇冠API中找到`);
            continue;
          }

          console.log(`\n📝 处理注单: Bet #${bet.id}, ticketId=${ticketId}`);
          console.log(`   金额: ${wager.gold}, 派彩: ${wager.winGold}, 结果: ${wager.resultText}`);

          // 解析派彩金额
          const winGoldRaw = wager.winGold ? parseFloat(wager.winGold) : null;
          
          if (winGoldRaw === null || winGoldRaw === undefined || isNaN(winGoldRaw)) {
            console.log(`⚠️  注单 ${ticketId} 尚未结算（winGold=${wager.winGold}）`);
            continue;
          }

          // 计算盈亏
          const discount = Number(bet.discount) || 1;
          const effectiveStake = Number(bet.bet_amount);
          const crownWinGold = winGoldRaw;
          
          let profitLoss = 0;
          let payout = 0;
          let result = '';
          let status = 'settled';

          // 判断结果
          const resultText = (wager.resultText || '').toLowerCase();
          const isCancelled = /取消|無效|无效|void/.test(resultText);
          
          if (isCancelled) {
            // 取消：退回本金
            result = 'cancelled';
            status = 'cancelled';
            profitLoss = 0;
            payout = effectiveStake;
            console.log(`   ❌ 注单被取消`);
          } else if (crownWinGold > 0) {
            // 赢：派彩 - 本金
            result = 'win';
            profitLoss = crownWinGold - effectiveStake;
            payout = crownWinGold;
            console.log(`   ✅ 赢: 派彩=${crownWinGold}, 盈利=${profitLoss}`);
          } else if (crownWinGold === 0) {
            // 输：-本金
            result = 'lose';
            profitLoss = -effectiveStake;
            payout = 0;
            console.log(`   ❌ 输: 损失=${profitLoss}`);
          } else {
            // 和局或其他
            result = 'draw';
            profitLoss = 0;
            payout = effectiveStake;
            console.log(`   ⚖️  和局`);
          }

          // 更新数据库
          console.log(`   💾 更新数据库: status=${status}, result=${result}, payout=${payout}, profit_loss=${profitLoss}`);
          
          await query(`
            UPDATE bets
            SET status = $1,
                result = $2,
                payout = $3,
                profit_loss = $4,
                settled_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
          `, [status, result, payout, profitLoss, bet.id]);

          console.log(`   ✅ 注单 #${bet.id} 更新成功`);
        }

      } catch (e) {
        console.log(`❌ 账号 ${accountId} 同步失败: ${e.message}`);
        console.error(e);
      }
    }

    console.log('\n✅ 测试同步完成！');
    await pool.end();
    process.exit(0);

  } catch (e) {
    console.error('❌ 测试失败:', e);
    await pool.end();
    process.exit(1);
  }
}

testSync();

