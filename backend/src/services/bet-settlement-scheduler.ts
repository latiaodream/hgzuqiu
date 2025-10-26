/**
 * 下注结算定时任务服务
 * 自动同步下注记录的输赢和比分
 */

import { query } from '../models/database';
import { getCrownAutomation } from './crown-automation';

interface SettlementStats {
  total: number;
  updated: number;
  failed: number;
  skipped: number;
}

class BetSettlementScheduler {
  private timer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private intervalMs: number = 24 * 60 * 60 * 1000; // 默认24小时执行一次
  private lastRunTime?: Date;
  private stats: SettlementStats = {
    total: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
  };

  constructor() {
    console.log('🎯 初始化下注结算定时任务服务');
  }

  /**
   * 启动定时任务
   * @param intervalMinutes 执行间隔（分钟），默认5分钟
   */
  start(intervalMinutes: number = 5): void {
    if (this.timer) {
      console.log('⚠️  定时任务已在运行中');
      return;
    }

    this.intervalMs = intervalMinutes * 60 * 1000;
    const hours = Math.floor(intervalMinutes / 60);
    const mins = intervalMinutes % 60;
    const intervalText = hours > 0 ? `${hours}小时${mins > 0 ? mins + '分钟' : ''}` : `${mins}分钟`;
    console.log(`✅ 启动下注结算定时任务，间隔: ${intervalText}`);

    // 启动后延迟1小时执行第一次
    setTimeout(() => {
      this.runSettlement().catch((e) => {
        console.error('❌ 首次结算任务执行失败:', e);
      });
    }, 60 * 60 * 1000); // 1小时

    // 设置定时器
    this.timer = setInterval(() => {
      this.runSettlement().catch((e) => {
        console.error('❌ 定时结算任务执行失败:', e);
      });
    }, this.intervalMs);
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      console.log('⏹️  下注结算定时任务已停止');
    }
  }

  /**
   * 获取任务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMs / 60000,
      lastRunTime: this.lastRunTime,
      stats: this.stats,
    };
  }

  /**
   * 执行结算任务
   */
  private async runSettlement(): Promise<void> {
    if (this.isRunning) {
      console.log('⏭️  上一次结算任务仍在执行中，跳过本次');
      return;
    }

    this.isRunning = true;
    this.lastRunTime = new Date();
    console.log(`\n🔄 [${this.lastRunTime.toLocaleString()}] 开始执行下注结算任务...`);

    try {
      // 重置统计
      this.stats = { total: 0, updated: 0, failed: 0, skipped: 0 };

      // 第一步：补齐官网单号（pending 且无 official_bet_id 的注单）
      await this.confirmPendingBets();

      // 第二步：同步结算结果（confirmed 或 pending 且有 official_bet_id 的注单）
      await this.syncSettlements();

      console.log(`✅ 结算任务完成: 总计 ${this.stats.total} 条，更新 ${this.stats.updated} 条，失败 ${this.stats.failed} 条，跳过 ${this.stats.skipped} 条\n`);
    } catch (error: any) {
      console.error('❌ 结算任务执行失败:', error?.message || error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 第一步：补齐官网单号
   * 为 pending 且无 official_bet_id 的注单尝试从皇冠API获取单号
   */
  private async confirmPendingBets(): Promise<void> {
    try {
      const result = await query(`
        SELECT b.*, ca.discount
        FROM bets b
        JOIN crown_accounts ca ON ca.id = b.account_id
        WHERE b.status = 'pending'
          AND (b.official_bet_id IS NULL OR b.official_bet_id = '')
        ORDER BY b.created_at ASC
      `);

      const pendingBets = result.rows;
      if (pendingBets.length === 0) {
        console.log('ℹ️  没有需要补齐单号的注单');
        return;
      }

      console.log(`📝 发现 ${pendingBets.length} 条待补齐单号的注单`);

      const automation = getCrownAutomation();
      const parseAmount = (value?: string | null): number | null => {
        if (!value) return null;
        const cleaned = value.replace(/[^0-9.\-]/g, '');
        if (!cleaned) return null;
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : null;
      };

      // 按账号分组
      const betsByAccount = new Map<number, any[]>();
      for (const bet of pendingBets) {
        const accountId = Number(bet.account_id);
        if (!betsByAccount.has(accountId)) {
          betsByAccount.set(accountId, []);
        }
        betsByAccount.get(accountId)!.push(bet);
      }

      let confirmed = 0;

      // 逐账号处理
      for (const [accountId, bets] of betsByAccount.entries()) {
        if (!automation.isAccountOnline(accountId)) {
          console.log(`⚠️  账号 ${accountId} 未在线，跳过`);
          continue;
        }

        try {
          // 获取今日注单
          const wagers = await automation.fetchTodayWagers(accountId);
          const pool = wagers
            .filter(it => it && it.ticketId && (!it.winGold || !/[0-9]/.test(String(it.winGold))))
            .map(it => ({ ticketId: String(it.ticketId), gold: parseAmount(it.gold) }))
            .filter(it => typeof it.gold === 'number');

          const usedTickets = new Set<string>();

          // 匹配注单
          for (const bet of bets) {
            const discount = Number(bet.discount) || 1;
            const crownStake = parseFloat((Number(bet.bet_amount) / discount).toFixed(2));
            const candidate = pool.find(
              it => !usedTickets.has(it.ticketId) && Math.abs((it.gold as number) - crownStake) < 0.01
            );

            if (candidate) {
              await query(`
                UPDATE bets 
                SET official_bet_id = $1, 
                    status = 'confirmed', 
                    confirmed_at = CURRENT_TIMESTAMP, 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING id
              `, [candidate.ticketId, bet.id]);

              usedTickets.add(candidate.ticketId);
              confirmed++;
              console.log(`✅ 补齐单号: Bet #${bet.id} -> ${candidate.ticketId}`);
            }
          }
        } catch (error: any) {
          console.error(`❌ 账号 ${accountId} 补齐单号失败:`, error?.message || error);
        }
      }

      console.log(`✅ 补齐单号完成: ${confirmed}/${pendingBets.length} 条`);
    } catch (error: any) {
      console.error('❌ 补齐单号阶段失败:', error?.message || error);
    }
  }

  /**
   * 第二步：同步结算结果
   * 为 confirmed 或 pending 且有 official_bet_id 的注单同步输赢结果
   * 使用 getBetDetail() 方法逐个查询注单详情
   */
  private async syncSettlements(): Promise<void> {
    try {
      const result = await query(`
        SELECT b.*, ca.discount
        FROM bets b
        JOIN crown_accounts ca ON ca.id = b.account_id
        WHERE b.status IN ('confirmed', 'pending')
          AND b.official_bet_id IS NOT NULL
          AND b.official_bet_id != ''
        ORDER BY b.created_at ASC
      `);

      const bets = result.rows;
      if (bets.length === 0) {
        console.log('ℹ️  没有需要同步结算的注单');
        return;
      }

      console.log(`📊 发现 ${bets.length} 条待结算的注单`);
      this.stats.total = bets.length;

      const automation = getCrownAutomation();
      const parseAmount = (value?: string | null): number | null => {
        if (!value) return null;
        const cleaned = value.replace(/[^0-9.\-]/g, '');
        if (!cleaned) return null;
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : null;
      };

      const roundTo = (num: number, decimals: number): number => {
        const factor = Math.pow(10, decimals);
        return Math.round(num * factor) / factor;
      };

      // 按账号分组
      const betsByAccount = new Map<number, any[]>();
      for (const bet of bets) {
        const accountId = Number(bet.account_id);
        if (!betsByAccount.has(accountId)) {
          betsByAccount.set(accountId, []);
        }
        betsByAccount.get(accountId)!.push(bet);
      }

      // 逐账号处理
      for (const [accountId, accountBets] of betsByAccount.entries()) {
        if (!automation.isAccountOnline(accountId)) {
          console.log(`⚠️  账号 ${accountId} 未在线，跳过 ${accountBets.length} 条注单`);
          this.stats.skipped += accountBets.length;
          continue;
        }

        // 逐个查询注单详情
        for (const bet of accountBets) {
          const ticketId = String(bet.official_bet_id);

          try {
            console.log(`🔍 查询注单详情: Bet #${bet.id}, ticketId=${ticketId}`);

            // 使用新的 getBetDetail 方法查询单个注单
            const detail = await automation.fetchBetDetail(accountId, ticketId);

            if (!detail.success) {
              console.log(`⚠️  注单 ${ticketId} 查询失败: ${detail.error}`);
              this.stats.skipped++;
              continue;
            }

            // 检查是否已结算
            const winGoldRaw = parseAmount(detail.winGold);
            if (winGoldRaw === null || winGoldRaw === undefined) {
              console.log(`⚠️  注单 ${ticketId} 尚未结算`);
              this.stats.skipped++;
              continue;
            }

            // 计算盈亏
            const discount = Number(bet.discount) || 1;
            const effectiveStake = Number(bet.bet_amount);
            const crownWinGold = winGoldRaw;
            const profitLoss = roundTo(crownWinGold * discount - effectiveStake, 2);

            // 判断输赢
            const normalizedText = `${detail.ballActRet || ''} ${detail.resultText || ''}`.toLowerCase();
            const isCancelled = /取消|void|無效|无效/.test(normalizedText);

            const tolerance = 0.01;
            let payout: number;
            let result: 'win' | 'lose' | 'draw' | 'cancelled';
            let status: 'settled' | 'cancelled' = 'settled';

            if (profitLoss > tolerance) {
              result = 'win';
              payout = roundTo(effectiveStake + profitLoss, 2);
            } else if (profitLoss < -tolerance) {
              result = 'lose';
              payout = 0;
            } else {
              if (isCancelled) {
                result = 'cancelled';
                status = 'cancelled';
              } else {
                result = 'draw';
              }
              payout = roundTo(effectiveStake, 2);
            }

            // 更新数据库
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

            this.stats.updated++;
            console.log(`✅ 结算: Bet #${bet.id} (${ticketId}) -> ${result} (${profitLoss >= 0 ? '+' : ''}${profitLoss})`);
          } catch (error: any) {
            console.error(`❌ 注单 ${ticketId} 同步失败:`, error?.message || error);
            this.stats.failed++;
          }
        }
      }
    } catch (error: any) {
      console.error('❌ 同步结算阶段失败:', error?.message || error);
    }
  }
}

// 单例
let schedulerInstance: BetSettlementScheduler | null = null;

export function getBetSettlementScheduler(): BetSettlementScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new BetSettlementScheduler();
  }
  return schedulerInstance;
}

