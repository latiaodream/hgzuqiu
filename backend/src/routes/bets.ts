import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../models/database';
import { BetCreateRequest, ApiResponse, Bet, AccountSelectionEntry } from '../types';
import { getCrownAutomation } from '../services/crown-automation';
import { selectAccounts } from '../services/account-selection';

const buildExclusionReason = (entry?: AccountSelectionEntry | null): string => {
    if (!entry) {
        return '不符合优选条件';
    }

    const reasons: string[] = [];
    if (entry.flags.offline) {
        reasons.push('账号未在线');
    }
    if (entry.flags.stop_profit_reached) {
        reasons.push('已达到止盈金额');
    }
    if (entry.flags.line_conflicted) {
        reasons.push('同线路账号已下注该赛事');
    }

    return reasons.length > 0 ? reasons.join('、') : '不符合优选条件';
};

const router = Router();
router.use(authenticateToken);

// 获取下注统计数据（数据看板） - 必须在 GET / 之前
router.get('/stats', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { start_date, end_date, user_id, account_id, agent_id } = req.query as any;

        // 构建查询条件
        let sql = `
            SELECT
                COALESCE(SUM(bet_amount), 0) as total_bet_amount,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN bet_amount ELSE 0 END), 0) as actual_amount,
                COALESCE(SUM(CASE WHEN status = 'settled' THEN profit_loss ELSE 0 END), 0) as actual_win_loss,
                COUNT(DISTINCT CASE WHEN status != 'cancelled' THEN id END) as total_tickets,
                COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as total_bets,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as canceled_bets
            FROM bets
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        // 权限控制：管理员和代理可以查看子用户数据
        if (userRole === 'admin') {
            // 管理员：支持按 user_id 或 agent_id 过滤
            if (user_id) {
                sql += ` AND user_id = $${paramIndex++}`;
                params.push(parseInt(user_id));
            } else if (agent_id) {
                sql += ` AND user_id IN (SELECT id FROM users WHERE agent_id = $${paramIndex++})`;
                params.push(parseInt(agent_id));
            }
        } else if (userRole === 'agent') {
            // 代理：如果指定了user_id，只看该下级员工数据；否则看自己和所有下级数据
            if (user_id) {
                // 验证该用户是代理的下级
                sql += ` AND user_id = $${paramIndex++} AND user_id IN (
                    SELECT id FROM users WHERE agent_id = $${paramIndex++}
                )`;
                params.push(parseInt(user_id), userId);
            } else {
                // 看自己和所有下级的数据
                sql += ` AND (user_id = $${paramIndex++} OR user_id IN (
                    SELECT id FROM users WHERE agent_id = $${paramIndex++}
                ))`;
                params.push(userId, userId);
            }
        } else {
            // 普通员工：只能看自己的数据
            sql += ` AND user_id = $${paramIndex++}`;
            params.push(userId);
        }

        // 日期筛选
        if (start_date) {
            sql += ` AND DATE(created_at) >= $${paramIndex++}`;
            params.push(start_date);
        }

        if (end_date) {
            sql += ` AND DATE(created_at) <= $${paramIndex++}`;
            params.push(end_date);
        }

        // 账号筛选
        if (account_id) {
            sql += ` AND account_id = $${paramIndex++}`;
            params.push(parseInt(account_id));
        }

        const result = await query(sql, params);
        const stats = result.rows[0];

        res.json({
            success: true,
            data: {
                total_bet_amount: parseFloat(stats.total_bet_amount) || 0,
                actual_amount: parseFloat(stats.actual_amount) || 0,
                actual_win_loss: parseFloat(stats.actual_win_loss) || 0,
                total_tickets: parseInt(stats.total_tickets) || 0,
                total_bets: parseInt(stats.total_bets) || 0,
                canceled_bets: parseInt(stats.canceled_bets) || 0,
            }
        } as ApiResponse);

    } catch (error) {
        console.error('获取下注统计错误:', error);
        res.status(500).json({
            success: false,
            error: '获取下注统计失败'
        });
    }
});

// 获取下注记录(票单列表)
router.get('/', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { status, date, account_id, limit = 50, offset = 0, user_id, agent_id } = req.query as any;

        let sql = `
            SELECT b.*, m.league_name, m.home_team, m.away_team, m.current_score,
                   ca.username as account_username, ca.display_name as account_display_name
            FROM bets b
            JOIN matches m ON b.match_id = m.id
            JOIN crown_accounts ca ON b.account_id = ca.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        // 角色范围过滤
        if (userRole === 'admin') {
            if (user_id) {
                sql += ` AND b.user_id = $${paramIndex++}`;
                params.push(parseInt(user_id));
            } else if (agent_id) {
                sql += ` AND b.user_id IN (SELECT id FROM users WHERE agent_id = $${paramIndex++})`;
                params.push(parseInt(agent_id));
            }
        } else if (userRole === 'agent') {
            if (user_id) {
                sql += ` AND b.user_id = $${paramIndex++} AND b.user_id IN (SELECT id FROM users WHERE agent_id = $${paramIndex++})`;
                params.push(parseInt(user_id), userId);
            } else {
                sql += ` AND (b.user_id = $${paramIndex++} OR b.user_id IN (SELECT id FROM users WHERE agent_id = $${paramIndex++}))`;
                params.push(userId, userId);
            }
        } else {
            sql += ` AND b.user_id = $${paramIndex++}`;
            params.push(userId);
        }

        if (status) {
            sql += ` AND b.status = $${paramIndex++}`;
            params.push(status);
        }

        if (date) {
            sql += ` AND DATE(b.created_at) = $${paramIndex++}`;
            params.push(date);
        }

        if (account_id) {
            sql += ` AND b.account_id = $${paramIndex++}`;
            params.push(account_id);
        }

        sql += ` ORDER BY b.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(sql, params);

        // 获取统计数据
        const statsResult = await query(`
            SELECT 
                COUNT(*) as total_bets,
                COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled_bets,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bets,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bets,
                COALESCE(SUM(bet_amount), 0) as total_amount,
                COALESCE(SUM(profit_loss), 0) as total_profit_loss,
                COALESCE(SUM(payout), 0) as total_payout
            FROM bets WHERE 1=1
            ${userRole === 'admin' ? (user_id ? ' AND user_id = $1' : (agent_id ? ' AND user_id IN (SELECT id FROM users WHERE agent_id = $1)' : ''))
                : userRole === 'agent' ? (user_id ? ' AND user_id = $1 AND user_id IN (SELECT id FROM users WHERE agent_id = $2)' : ' AND (user_id = $1 OR user_id IN (SELECT id FROM users WHERE agent_id = $1))')
                : ' AND user_id = $1'}
        `, ((): any[] => {
            if (userRole === 'admin') {
                if (user_id) return [parseInt(user_id)];
                if (agent_id) return [parseInt(agent_id)];
                return [];
            }
            if (userRole === 'agent') {
                if (user_id) return [parseInt(user_id), userId];
                return [userId];
            }
            return [userId];
        })());

        const stats = statsResult.rows[0];
        const winRate = stats.settled_bets > 0 
            ? ((stats.total_profit_loss / stats.total_amount) * 100).toFixed(1)
            : '0';

        res.json({
            success: true,
            data: {
                bets: result.rows,
                stats: {
                    total_bets: parseInt(stats.total_bets),
                    settled_bets: parseInt(stats.settled_bets),
                    pending_bets: parseInt(stats.pending_bets),
                    cancelled_bets: parseInt(stats.cancelled_bets),
                    total_amount: parseFloat(stats.total_amount),
                    total_profit_loss: parseFloat(stats.total_profit_loss),
                    total_payout: parseFloat(stats.total_payout),
                    win_rate: `${winRate}%`
                }
            }
        } as ApiResponse);

    } catch (error) {
        console.error('获取下注记录错误:', error);
        res.status(500).json({
            success: false,
            error: '获取下注记录失败'
        });
    }
});

// 创建下注记录(批量下注)
router.post('/', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const agentId = req.user.agent_id; // 获取代理ID，用于金币扣费
        const betData: BetCreateRequest = req.body;

        console.log('📝 收到下注请求:', JSON.stringify(betData, null, 2));

        if (!betData.account_ids || betData.account_ids.length === 0) {
            console.log('❌ 验证失败: 未选择账号');
            return res.status(400).json({
                success: false,
                error: '请选择下注账号'
            });
        }

        const hasMatchIdentifier = (
            (typeof betData.match_id === 'number' && Number.isFinite(betData.match_id)) ||
            (typeof betData.crown_match_id === 'string' && betData.crown_match_id.trim().length > 0)
        );

        if (!hasMatchIdentifier || !betData.bet_type || !betData.bet_amount) {
            console.log('❌ 验证失败: 缺少必填字段', {
                match_id: betData.match_id,
                crown_match_id: betData.crown_match_id,
                bet_type: betData.bet_type,
                bet_amount: betData.bet_amount
            });
            return res.status(400).json({
                success: false,
                error: '比赛信息、下注类型和金额不能为空'
            });
        }
        const crownMatchIdRaw = (betData.crown_match_id || '').toString().trim();
        const crownMatchId = crownMatchIdRaw || (
            typeof betData.match_id === 'number' && Number.isFinite(betData.match_id)
                ? String(betData.match_id)
                : undefined
        );

        let matchRecord: any | undefined;
        let matchDbId: number | undefined = undefined;

        if (typeof betData.match_id === 'number' && Number.isFinite(betData.match_id)) {
            const matchById = await query('SELECT * FROM matches WHERE id = $1', [betData.match_id]);
            if (matchById.rows.length > 0) {
                matchRecord = matchById.rows[0];
                matchDbId = matchRecord.id;
            }
        }

        if (!matchRecord && crownMatchId) {
            const matchByCrown = await query('SELECT * FROM matches WHERE match_id = $1', [crownMatchId]);
            if (matchByCrown.rows.length > 0) {
                matchRecord = matchByCrown.rows[0];
                matchDbId = matchRecord.id;
            }
        }

        if (!matchRecord) {
            if (!betData.league_name || !betData.home_team || !betData.away_team) {
                return res.status(400).json({
                    success: false,
                    error: '比赛不存在且缺少创建比赛所需的信息'
                });
            }

            const matchTime = betData.match_time ? new Date(betData.match_time) : new Date();
            const safeMatchTime = Number.isFinite(matchTime.getTime()) ? matchTime : new Date();

            const insertResult = await query(`
                INSERT INTO matches (
                    match_id, league_name, home_team, away_team, match_time, status, current_score, match_period
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                crownMatchId || `auto-${Date.now()}`,
                betData.league_name,
                betData.home_team,
                betData.away_team,
                safeMatchTime,
                betData.match_status || 'scheduled',
                betData.current_score || null,
                betData.match_period || null,
            ]);

            matchRecord = insertResult.rows[0];
            matchDbId = matchRecord.id;
        }

        if (!matchDbId) {
            return res.status(400).json({
                success: false,
                error: '无法确定比赛信息'
            });
        }

        betData.match_id = matchDbId;
        const resolvedCrownMatchId = matchRecord.match_id || crownMatchId;

        // 验证账号归属范围，并记录账号所属用户
        let ownershipSql = `
            SELECT id, user_id
            FROM crown_accounts
            WHERE id = ANY($1) AND is_enabled = true
        `;
        const ownershipParams: any[] = [betData.account_ids];
        if (userRole === 'admin') {
            // 管理员：允许操作任意启用账号
        } else if (userRole === 'agent') {
            ownershipSql += ` AND (user_id = $2 OR user_id IN (SELECT id FROM users WHERE agent_id = $2))`;
            ownershipParams.push(userId);
        } else {
            ownershipSql += ` AND user_id = $2`;
            ownershipParams.push(userId);
        }
        const ownershipResult = await query(ownershipSql, ownershipParams);

        if (ownershipResult.rows.length !== betData.account_ids.length) {
            return res.status(400).json({
                success: false,
                error: '部分账号不存在或已禁用'
            });
        }

        const eligibleMap = new Map<number, AccountSelectionEntry>();
        const excludedMap = new Map<number, AccountSelectionEntry>();

        const ownerIds = Array.from(new Set(ownershipResult.rows.map(row => Number(row.user_id))));
        for (const ownerId of ownerIds) {
            const ownerSelection = await selectAccounts({
                userId: ownerId,
                matchId: betData.match_id,
            });

            ownerSelection.eligible_accounts.forEach((entry) => {
                eligibleMap.set(entry.account.id, entry);
            });

            ownerSelection.excluded_accounts.forEach((entry) => {
                excludedMap.set(entry.account.id, entry);
            });
        }

        const invalidAccounts: Array<{ id: number; reason: string }> = [];
        const usedLineKeys = new Set<string>();
        const validatedAccountIds: number[] = [];

        for (const accId of betData.account_ids) {
            const entry = eligibleMap.get(accId);
            if (!entry) {
                const reason = buildExclusionReason(excludedMap.get(accId));
                invalidAccounts.push({ id: accId, reason });
                continue;
            }

            const lineKey = entry.account.line_key;
            if (usedLineKeys.has(lineKey)) {
                invalidAccounts.push({
                    id: accId,
                    reason: `与其他所选账号属于同一线路 (${lineKey})，同场仅允许一次下注`,
                });
                continue;
            }

            usedLineKeys.add(lineKey);
            validatedAccountIds.push(accId);
        }

        if (invalidAccounts.length > 0) {
            const detail = invalidAccounts
                .map((item) => `账号 ${item.id}: ${item.reason}`)
                .join('；');
            return res.status(400).json({
                success: false,
                error: `部分账号无法下注：${detail}`,
            });
        }

        if (validatedAccountIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: '暂无符合条件的账号可下注',
            });
        }

        const createdBets: Array<{ record: any; crown_result: any; accountId: number; match: any }> = [];
        const verifiableBets: Array<{ record: any; crown_result: any; accountId: number; match: any }> = [];
        const failedBets: Array<{ accountId: number; error: string }> = [];

        // 为每个账号创建下注记录并执行真实下注
        for (const accountId of validatedAccountIds) {
            try {
                // 首先检查账号是否在线
                if (!getCrownAutomation().isAccountOnline(accountId)) {
                    failedBets.push({
                        accountId,
                        error: '账号未登录'
                    });
                    continue;
                }

                // 获取账号信息以计算折扣后的金额
                const accountInfo = await query(
                    'SELECT discount FROM crown_accounts WHERE id = $1',
                    [accountId]
                );

                const discount = accountInfo.rows[0]?.discount || 1;
                const platformAmount = betData.bet_amount;
                const crownAmount = parseFloat((platformAmount / discount).toFixed(2));

                // 调用真实的Crown下注API
                const betResult = await getCrownAutomation().placeBet(accountId, {
                    betType: betData.bet_type,
                    betOption: betData.bet_option,
                    amount: crownAmount,
                    odds: betData.odds,
                    platformAmount,
                    discount,
                    match_id: betData.match_id,
                    matchId: betData.match_id,
                    crown_match_id: resolvedCrownMatchId,
                    crownMatchId: resolvedCrownMatchId,
                    league_name: betData.league_name || matchRecord.league_name,
                    leagueName: betData.league_name || matchRecord.league_name,
                    home_team: betData.home_team || matchRecord.home_team,
                    homeTeam: betData.home_team || matchRecord.home_team,
                    away_team: betData.away_team || matchRecord.away_team,
                    awayTeam: betData.away_team || matchRecord.away_team,
                });

                // 创建数据库记录
                const initialStatus = betResult.success ? 'pending' : 'cancelled';

                const insertResult = await query(`
                    INSERT INTO bets (
                        user_id, account_id, match_id, bet_type, bet_option, bet_amount, odds,
                        single_limit, interval_seconds, quantity, status, official_bet_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING *
                `, [
                    userId,
                    accountId,
                    betData.match_id,
                    betData.bet_type,
                    betData.bet_option,
                    betData.bet_amount,
                    betResult.actualOdds || betData.odds,
                    betData.single_limit || betData.bet_amount,
                    betData.interval_seconds || 3,
                    betData.quantity || 1,
                    initialStatus,
                    betResult.betId || null
                ]);

                const createdRecord = insertResult.rows[0];

                const payload = {
                    record: createdRecord,
                    crown_result: betResult,
                    accountId,
                    match: matchRecord,
                };

                createdBets.push(payload);

                if (betResult.success) {
                    verifiableBets.push(payload);
                } else {
                    failedBets.push({
                        accountId,
                        error: betResult.message || '下注失败',
                    });
                }

                // 创建金币流水记录(消耗) - 仅当下注成功时
                // 金币从代理账户扣除（如果是员工下注）或从自己账户扣除（如果是代理下注）
                if (betResult.success) {
                    const transactionId = `BET${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

                    // 确定扣费用户：员工下注扣代理金币，代理下注扣自己金币
                    const chargeUserId = (userRole === 'staff' && agentId) ? agentId : userId;

                    // 获取当前余额
                    const balanceResult = await query(
                        'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
                        [chargeUserId]
                    );
                    const currentBalance = parseFloat(balanceResult.rows[0].balance);

                    await query(`
                        INSERT INTO coin_transactions (
                            user_id, account_id, bet_id, transaction_id, transaction_type,
                            description, amount, balance_before, balance_after
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `, [
                        chargeUserId,  // 扣代理的金币（如果是员工）或自己的金币（如果是代理）
                        accountId,
                        createdRecord.id,
                        transactionId,
                        '消耗',
                        `下注消耗 - ${betData.bet_type} ${betData.bet_option}${userRole === 'staff' ? ` (员工: ${req.user.username})` : ''}`,
                        -betData.bet_amount,
                        currentBalance,
                        currentBalance - betData.bet_amount
                    ]);
                }
            } catch (accountError: any) {
                console.error(`账号 ${accountId} 下注失败:`, accountError);
                failedBets.push({
                    accountId,
                    error: accountError.message || '下注失败'
                });
            }
        }

        const automation = getCrownAutomation();

        for (const created of verifiableBets) {
            const betRecord = created.record;
            const betResult = created.crown_result;
            const matchInfo = created.match || {};

            if (!automation.isAccountOnline(created.accountId)) {
                failedBets.push({
                    accountId: created.accountId,
                    error: '下注完成后账号离线，无法匹配官网注单'
                });
                continue;
            }

            let matchedWager: any = null;
            const maxAttempts = 3;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const wagers = await automation.fetchTodayWagers(created.accountId).catch(() => null);

                if (wagers && wagers.length > 0) {
                    matchedWager = betResult.betId
                        ? wagers.find((item: any) => item.ticketId === betResult.betId) || null
                        : null;

                    if (!matchedWager) {
                        matchedWager = automation.findMatchingWager(
                            wagers,
                            matchInfo.league_name || matchInfo.leagueName || null,
                            matchInfo.home_team || matchInfo.homeTeam || null,
                            matchInfo.away_team || matchInfo.awayTeam || null,
                        );
                    }
                }

                if (matchedWager) {
                    break;
                }

                if (attempt < maxAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            }

            if (!matchedWager) {
                const reason = betResult.message || '官网未找到对应注单';
                failedBets.push({
                    accountId: created.accountId,
                    error: reason
                });
                continue;
            }

            const ticketId = String(matchedWager.ticketId || '').trim();
            if (!ticketId) {
                failedBets.push({
                    accountId: created.accountId,
                    error: '官网注单号为空'
                });
                continue;
            }

            await query(`
                UPDATE bets SET
                    status = 'confirmed',
                    official_bet_id = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [ticketId, betRecord.id]);

            created.record = {
                ...betRecord,
                status: 'confirmed',
                official_bet_id: ticketId,
            };
        }

        const totalRequested = validatedAccountIds.length;
        const successCount = createdBets.filter(entry => entry.record.status === 'confirmed').length;
        const failCount = failedBets.length;

        res.status(successCount > 0 ? 201 : 400).json({
            success: successCount > 0,
            data: {
                bets: createdBets.map(entry => ({
                    ...entry.record,
                    crown_result: entry.crown_result,
                })),
                failed: failedBets,
                stats: {
                    total: totalRequested,
                    success: successCount,
                    failed: failCount
                }
            },
            message: successCount > 0
                ? `成功下注 ${successCount}/${totalRequested} 个账号${failCount > 0 ? `，${failCount} 个失败` : ''}`
                : `全部下注失败 (${failCount}/${totalRequested})`
        } as ApiResponse);

    } catch (error) {
        console.error('创建下注记录错误:', error);
        res.status(500).json({
            success: false,
            error: '创建下注记录失败'
        });
    }
});

// 同步结算结果
router.post('/sync-settlements', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const accountIdsRaw = Array.isArray(req.body?.account_ids) ? req.body.account_ids : undefined;
        const accountIds = accountIdsRaw
            ? accountIdsRaw
                .map((id: any) => Number(id))
                .filter((id: number) => Number.isInteger(id))
            : undefined;

        const params: any[] = [];
        let sql = `
            SELECT b.*, ca.discount
            FROM bets b
            JOIN crown_accounts ca ON ca.id = b.account_id
            WHERE 1=1
              AND b.status IN ('confirmed', 'pending')
              AND b.official_bet_id IS NOT NULL
        `;
        if (userRole === 'admin') {
            // no additional filter
        } else if (userRole === 'agent') {
            sql += ` AND (b.user_id = $${params.length + 1} OR b.user_id IN (SELECT id FROM users WHERE agent_id = $${params.length + 1}))`;
            params.push(userId);
        } else {
            sql += ` AND b.user_id = $${params.length + 1}`;
            params.push(userId);
        }
        if (accountIds && accountIds.length > 0) {
            sql += ` AND b.account_id = ANY($${params.length + 1})`;
            params.push(accountIds);
        }
        sql += ' ORDER BY b.created_at ASC';

        const pendingResult = await query(sql, params);
        const pendingBets = pendingResult.rows;

        if (pendingBets.length === 0) {
            return res.json({
                success: true,
                message: '暂无需要同步的注单',
                data: {
                    updated_bets: [],
                    errors: [],
                    skipped: []
                }
            } as ApiResponse);
        }

        const roundTo = (value: number, digits = 2) => {
            const factor = Math.pow(10, digits);
            return Math.round(value * factor) / factor;
        };

        const parseAmount = (value?: string | null): number | null => {
            if (!value) {
                return null;
            }
            const cleaned = value.replace(/[^0-9.\-]/g, '');
            if (!cleaned) {
                return null;
            }
            const num = parseFloat(cleaned);
            return Number.isFinite(num) ? num : null;
        };

        const groupByAccount = new Map<number, any[]>();
        for (const bet of pendingBets) {
            const accId = Number(bet.account_id);
            if (!groupByAccount.has(accId)) {
                groupByAccount.set(accId, []);
            }
            groupByAccount.get(accId)!.push(bet);
        }

        const automation = getCrownAutomation();
        const updatedBets: Array<{ id: number; ticketId: string; status: string; result: string; payout: number; profit_loss: number }>
            = [];
        const errors: Array<{ accountId: number; error: string }> = [];
        const skipped: Array<{ betId: number; reason: string }> = [];

        for (const [accountId, bets] of groupByAccount.entries()) {
            if (!automation.isAccountOnline(accountId)) {
                errors.push({ accountId, error: '账号未登录' });
                continue;
            }

            let wagers;
            try {
                wagers = await automation.fetchTodayWagers(accountId);
            } catch (fetchError: any) {
                errors.push({
                    accountId,
                    error: fetchError instanceof Error ? fetchError.message : String(fetchError)
                });
                continue;
            }

            const wagerMap = new Map<string, any>();
            for (const item of wagers) {
                if (item.ticketId) {
                    wagerMap.set(String(item.ticketId), item);
                }
            }

            for (const bet of bets) {
                const ticketIdRaw = bet.official_bet_id ? String(bet.official_bet_id) : '';
                if (!ticketIdRaw) {
                    skipped.push({ betId: bet.id, reason: '缺少官网注单号' });
                    continue;
                }

                const wager = wagerMap.get(ticketIdRaw);
                if (!wager) {
                    skipped.push({ betId: bet.id, reason: '官网未找到对应注单' });
                    continue;
                }

                const winGoldStr = (wager.winGold || '').trim();
                if (!winGoldStr || !/[0-9]/.test(winGoldStr)) {
                    // 官网仍未结算
                    continue;
                }

                const crownStake = parseAmount(wager.gold);
                const crownProfit = parseAmount(winGoldStr);

                if (crownStake === null || crownProfit === null) {
                    skipped.push({ betId: bet.id, reason: '官网注单金额解析失败' });
                    continue;
                }

                const discount = Number(bet.discount) || 1;
                const platformStakeRecorded = Number(bet.bet_amount) || 0;
                const platformStakeFromCrown = roundTo(crownStake * discount, 2);
                let profitLoss = roundTo(crownProfit * discount, 2);

                const effectiveStake = platformStakeRecorded > 0
                    ? roundTo(platformStakeRecorded, 2)
                    : platformStakeFromCrown;

                const normalizedText = `${wager.ballActRet || ''} ${wager.resultText || ''}`.toLowerCase();
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
                    profitLoss = 0;
                    if (isCancelled) {
                        result = 'cancelled';
                        status = 'cancelled';
                    } else {
                        result = 'draw';
                    }
                    payout = roundTo(effectiveStake, 2);
                }

                const updateResult = await query(`
                    UPDATE bets SET
                        status = $1,
                        result = $2,
                        payout = $3,
                        profit_loss = $4,
                        settled_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $5 AND user_id = $6
                    RETURNING id
                `, [status, result, payout, profitLoss, bet.id, userId]);

                if (updateResult.rows.length === 0) {
                    skipped.push({ betId: bet.id, reason: '更新注单失败' });
                    continue;
                }

                if (payout > 0) {
                    const existingRefund = await query(
                        `SELECT id FROM coin_transactions WHERE bet_id = $1 AND transaction_type = '返还' LIMIT 1`,
                        [bet.id]
                    );

                    if (existingRefund.rows.length === 0) {
                        const transactionId = `PAYOUT${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
                        const balanceBeforeResult = await query(
                            'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
                            [userId]
                        );
                        const balanceBefore = parseFloat(balanceBeforeResult.rows[0]?.balance || '0');
                        const balanceAfter = roundTo(balanceBefore + payout, 2);

                        await query(`
                            INSERT INTO coin_transactions (
                                user_id, account_id, bet_id, transaction_id, transaction_type,
                                description, amount, balance_before, balance_after
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        `, [
                            userId,
                            bet.account_id,
                            bet.id,
                            transactionId,
                            '返还',
                            `下注派彩 - ${bet.bet_type} ${bet.bet_option}`,
                            payout,
                            balanceBefore,
                            balanceAfter
                        ]);
                    }
                }

                updatedBets.push({
                    id: bet.id,
                    ticketId: ticketIdRaw,
                    status,
                    result,
                    payout,
                    profit_loss: profitLoss
                });
            }
        }

        res.json({
            success: true,
            message: `同步完成，更新 ${updatedBets.length} 条注单`,
            data: {
                updated_bets: updatedBets,
                errors,
                skipped
            }
        } as ApiResponse);

    } catch (error) {
        console.error('同步注单结算失败:', error);
        res.status(500).json({
            success: false,
            error: '同步下注结算失败'
        } as ApiResponse);
    }
});

// 更新下注状态
router.put('/:id/status', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const betId = parseInt(req.params.id);
        const { status, result, payout, official_bet_id } = req.body;

        // 检查下注记录是否属于当前用户
        const betCheck = await query(
            'SELECT * FROM bets WHERE id = $1 AND user_id = $2',
            [betId, userId]
        );

        if (betCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '下注记录不存在'
            });
        }

        const bet = betCheck.rows[0];
        let profitLoss = 0;

        if (status === 'settled' && payout) {
            profitLoss = payout - bet.bet_amount;
        }

        const updateResult = await query(`
            UPDATE bets SET
                status = $1,
                result = $2,
                payout = $3,
                profit_loss = $4,
                official_bet_id = $5,
                confirmed_at = CASE WHEN $1 = 'confirmed' THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
                settled_at = CASE WHEN $1 = 'settled' THEN CURRENT_TIMESTAMP ELSE settled_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND user_id = $7
            RETURNING *
        `, [status, result, payout || 0, profitLoss, official_bet_id, betId, userId]);

        // 如果是结算且有派彩，创建返还流水
        // 派彩返还到代理账户（如果是员工下注）或自己账户（如果是代理下注）
        if (status === 'settled' && payout > 0) {
            const transactionId = `PAYOUT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

            // 查询下注用户的角色和代理ID
            const userInfo = await query(
                'SELECT role, agent_id, username FROM users WHERE id = $1',
                [bet.user_id]
            );

            const betUser = userInfo.rows[0];
            // 确定返还用户：员工下注返还给代理，代理下注返还给自己
            const returnUserId = (betUser.role === 'staff' && betUser.agent_id) ? betUser.agent_id : bet.user_id;

            const balanceResult = await query(
                'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
                [returnUserId]
            );
            const currentBalance = parseFloat(balanceResult.rows[0].balance);

            await query(`
                INSERT INTO coin_transactions (
                    user_id, account_id, bet_id, transaction_id, transaction_type,
                    description, amount, balance_before, balance_after
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                returnUserId,  // 返还给代理（如果是员工）或自己（如果是代理）
                bet.account_id,
                betId,
                transactionId,
                '返还',
                `下注派彩 - ${bet.bet_type} ${bet.bet_option}${betUser.role === 'staff' ? ` (员工: ${betUser.username})` : ''}`,
                payout,
                currentBalance,
                currentBalance + payout
            ]);
        }

        res.json({
            success: true,
            data: updateResult.rows[0],
            message: '下注状态更新成功'
        } as ApiResponse<Bet>);

    } catch (error) {
        console.error('更新下注状态错误:', error);
        res.status(500).json({
            success: false,
            error: '更新下注状态失败'
        });
    }
});

export { router as betRoutes };
