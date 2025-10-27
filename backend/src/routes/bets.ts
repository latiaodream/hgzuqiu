import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../models/database';
import { BetCreateRequest, ApiResponse, Bet, AccountSelectionEntry } from '../types';
import { getCrownAutomation } from '../services/crown-automation';
import { selectAccounts } from '../services/account-selection';
import { getBetSettlementScheduler } from '../services/bet-settlement-scheduler';

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
        // 票单数：下注的场次数（不同的 match_id）
        // 注单数：所有账号的下注次数（所有 bet 记录数）
        let sql = `
            SELECT
                COALESCE(SUM(bet_amount), 0) as total_bet_amount,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN bet_amount ELSE 0 END), 0) as actual_amount,
                COALESCE(SUM(CASE WHEN status = 'settled' THEN profit_loss ELSE 0 END), 0) as actual_win_loss,
                COUNT(DISTINCT CASE WHEN status != 'cancelled' THEN match_id END) as total_tickets,
                COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as total_bets,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as canceled_bets
            FROM bets
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        // 权限控制：管理员和代理可以查看子用户数据
        if (userRole === 'admin') {
            // 管理员：可以查看所有数据，或按 user_id/agent_id 过滤
            if (user_id) {
                sql += ` AND user_id = $${paramIndex++}`;
                params.push(parseInt(user_id));
            } else if (agent_id) {
                sql += ` AND user_id IN (SELECT id FROM users WHERE agent_id = $${paramIndex++})`;
                params.push(parseInt(agent_id));
            }
            // 如果都没指定，则查看所有数据（不添加额外条件）
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
                   ca.username as account_username, ca.display_name as account_display_name,
                   u.username as user_username, u.role as user_role
            FROM bets b
            JOIN matches m ON b.match_id = m.id
            JOIN crown_accounts ca ON b.account_id = ca.id
            JOIN users u ON b.user_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        // 角色范围过滤
        if (userRole === 'admin') {
            // 管理员：可以查看所有数据，或按 user_id/agent_id 过滤
            if (user_id) {
                sql += ` AND b.user_id = $${paramIndex++}`;
                params.push(parseInt(user_id));
            } else if (agent_id) {
                sql += ` AND b.user_id IN (SELECT id FROM users WHERE agent_id = $${paramIndex++})`;
                params.push(parseInt(agent_id));
            }
            // 如果都没指定，则查看所有数据（不添加额外条件）
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

        // 获取统计数据 - 构建与主查询相同的筛选条件
        let statsSql = `
            SELECT
                COUNT(*) as total_bets,
                COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled_bets,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bets,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bets,
                COALESCE(SUM(bet_amount), 0) as total_amount,
                COALESCE(SUM(profit_loss), 0) as total_profit_loss,
                COALESCE(SUM(payout), 0) as total_payout
            FROM bets WHERE 1=1
        `;
        const statsParams: any[] = [];
        let statsParamIndex = 1;

        // 添加用户权限筛选
        if (userRole === 'admin') {
            // 管理员：可以查看所有数据，或按 user_id/agent_id 过滤
            if (user_id) {
                statsSql += ` AND user_id = $${statsParamIndex++}`;
                statsParams.push(parseInt(user_id));
            } else if (agent_id) {
                statsSql += ` AND user_id IN (SELECT id FROM users WHERE agent_id = $${statsParamIndex++})`;
                statsParams.push(parseInt(agent_id));
            }
            // 如果都没指定，则查看所有数据（不添加额外条件）
        } else if (userRole === 'agent') {
            if (user_id) {
                statsSql += ` AND user_id = $${statsParamIndex++} AND user_id IN (SELECT id FROM users WHERE agent_id = $${statsParamIndex++})`;
                statsParams.push(parseInt(user_id), userId);
            } else {
                statsSql += ` AND (user_id = $${statsParamIndex++} OR user_id IN (SELECT id FROM users WHERE agent_id = $${statsParamIndex++}))`;
                statsParams.push(userId, userId);
            }
        } else {
            statsSql += ` AND user_id = $${statsParamIndex++}`;
            statsParams.push(userId);
        }

        // 添加日期筛选
        if (date) {
            statsSql += ` AND DATE(created_at) = $${statsParamIndex++}`;
            statsParams.push(date);
        }

        // 添加账号筛选
        if (account_id) {
            statsSql += ` AND account_id = $${statsParamIndex++}`;
            statsParams.push(account_id);
        }

        const statsResult = await query(statsSql, statsParams);

        const stats = statsResult.rows[0];
        const winRate = stats.settled_bets > 0
            ? ((stats.total_profit_loss / stats.total_amount) * 100).toFixed(1)
            : '0';

        // 转换数字字段，确保前端接收到正确的数字类型
        const bets = result.rows.map((bet: any) => ({
            ...bet,
            bet_amount: parseFloat(bet.bet_amount),
            odds: parseFloat(bet.odds),
            official_odds: bet.official_odds ? parseFloat(bet.official_odds) : null,
            min_odds: bet.min_odds ? parseFloat(bet.min_odds) : null,
            single_limit: parseFloat(bet.single_limit),
            payout: bet.payout ? parseFloat(bet.payout) : null,
            profit_loss: bet.profit_loss ? parseFloat(bet.profit_loss) : null,
            result_score: bet.score || null, // 将 score 字段映射为 result_score
        }));

        res.json({
            success: true,
            data: {
                bets,
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

        const normalizedOdds = Number(betData.odds);
        if (!Number.isFinite(normalizedOdds) || normalizedOdds <= 0) {
            return res.status(400).json({
                success: false,
                error: '缺少有效的预估赔率',
            });
        }
        betData.odds = normalizedOdds;

        if (betData.min_odds !== undefined && betData.min_odds !== null) {
            const normalizedMinOdds = Number(betData.min_odds);
            betData.min_odds = (Number.isFinite(normalizedMinOdds) && normalizedMinOdds > 0)
                ? normalizedMinOdds
                : undefined;
        } else {
            betData.min_odds = undefined;
        }

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
                matchId: resolvedCrownMatchId ? Number(resolvedCrownMatchId) : undefined,
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

        console.log(`🔍 [下注验证] 请求账号: ${betData.account_ids.join(', ')}`);
        console.log(`🔍 [下注验证] 验证通过的账号: ${validatedAccountIds.join(', ')}`);
        console.log(`🔍 [下注验证] 被排除的账号: ${invalidAccounts.map(a => `${a.id}(${a.reason})`).join(', ')}`);

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

        // ========== 新增：下注前检查金币余额并立即扣款 ==========
        const totalBetAmount = betData.bet_amount * (betData.quantity || 1) * validatedAccountIds.length;

        // 获取用户当前金币余额
        const balanceResult = await query(
            'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
            [userId]
        );
        const currentBalance = parseFloat(balanceResult.rows[0].balance);

        // 检查余额是否足够
        if (currentBalance < totalBetAmount) {
            return res.status(400).json({
                success: false,
                error: `金币余额不足。当前余额：${currentBalance.toFixed(2)}，需要：${totalBetAmount.toFixed(2)}`
            });
        }

        // 立即扣除金币（在下注之前）
        const deductTransactionId = `BET_DEDUCT_${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        await query(`
            INSERT INTO coin_transactions (
                user_id, transaction_id, transaction_type,
                description, amount, balance_before, balance_after
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            userId,
            deductTransactionId,
            '消耗',
            `下注扣款 - ${betData.bet_type} ${betData.bet_option} (${validatedAccountIds.length}个账号)`,
            -totalBetAmount,
            currentBalance,
            currentBalance - totalBetAmount
        ]);

        console.log(`✅ 金币已扣除：用户${userId}，金额${totalBetAmount}，余额${currentBalance} -> ${currentBalance - totalBetAmount}`);
        // ========== 金币扣款结束 ==========

        const createdBets = [];
        const failedBets = [];
        let allBetsFailed = true; // 用于判断是否所有下注都失败，需要退款
        const automation = getCrownAutomation();

        // 并行为每个账号创建下注记录并执行真实下注
        const betPromises = validatedAccountIds.map(async (accountId) => {
            try {
                // 首先检查账号是否在线
                if (!automation.isAccountOnline(accountId)) {
                    return {
                        success: false,
                        accountId,
                        error: '账号未登录'
                    };
                }

                // 获取账号信息以计算折扣后的金额
                const accountInfo = await query(
                    'SELECT discount FROM crown_accounts WHERE id = $1',
                    [accountId]
                );

                const discount = accountInfo.rows[0]?.discount || 1;
                const platformAmount = betData.bet_amount;
                const crownAmount = parseFloat((platformAmount / discount).toFixed(2));

                let previewOdds: number | undefined;
                const hasMinOdds = typeof betData.min_odds === 'number' && Number.isFinite(betData.min_odds) && betData.min_odds > 0;
                const effectiveMinOdds = hasMinOdds ? (betData.min_odds as number) : undefined;
                const canPreviewMinOdds = hasMinOdds && resolvedCrownMatchId;
                if (canPreviewMinOdds) {
                    const preview = await automation.previewBetOdds(accountId, {
                        betType: betData.bet_type,
                        betOption: betData.bet_option,
                        amount: crownAmount,
                        odds: betData.odds,
                        min_odds: effectiveMinOdds,
                        match_id: betData.match_id,
                        matchId: betData.match_id,
                        gid: resolvedCrownMatchId,
                        crown_match_id: resolvedCrownMatchId,
                        crownMatchId: resolvedCrownMatchId,
                        league_name: betData.league_name || matchRecord.league_name,
                        home_team: betData.home_team || matchRecord.home_team,
                        away_team: betData.away_team || matchRecord.away_team,
                    });
                    if (preview.success && typeof preview.odds === 'number') {
                        previewOdds = preview.odds;
                        if (previewOdds < (effectiveMinOdds as number)) {
                            return {
                                success: false,
                                accountId,
                                error: `当前官方赔率 ${previewOdds.toFixed(3)} 低于最低赔率 ${(effectiveMinOdds as number).toFixed(3)}`
                            };
                        }
                    } else {
                        console.warn(`账号 ${accountId} 预览官方赔率失败，跳过预检：`, preview.error || '未知错误');
                    }
                } else if (hasMinOdds && !resolvedCrownMatchId) {
                    console.info(`账号 ${accountId} 缺少皇冠matchId，使用最低赔率但跳过本地预检`);
                }

                // 调用真实的Crown下注API
                const betResult = await automation.placeBet(accountId, {
                    betType: betData.bet_type,
                    betOption: betData.bet_option,
                    amount: crownAmount,
                    odds: betData.odds,
                    min_odds: effectiveMinOdds,
                    platformAmount,
                    discount,
                    match_id: betData.match_id,
                    matchId: betData.match_id,
                    gid: resolvedCrownMatchId,
                    crown_match_id: resolvedCrownMatchId,
                    crownMatchId: resolvedCrownMatchId,
                    league_name: betData.league_name || matchRecord.league_name,
                    leagueName: betData.league_name || matchRecord.league_name,
                    home_team: betData.home_team || matchRecord.home_team,
                    homeTeam: betData.home_team || matchRecord.home_team,
                    away_team: betData.away_team || matchRecord.away_team,
                    awayTeam: betData.away_team || matchRecord.away_team,
                });

                const officialBetId = betResult.betId || null;
                const officialOddsToPersist = betResult.actualOdds ?? previewOdds ?? null;
                let accountBalanceAfter: number | null = null;
                let accountCreditAfter: number | null = null;

                if (betResult.success) {
                    const betStatus: Bet['status'] = 'confirmed';
                    const result = await query(`
                        INSERT INTO bets (
                            user_id, account_id, match_id, bet_type, bet_option, bet_amount, odds,
                            min_odds, official_odds,
                            single_limit, interval_seconds, quantity, status, official_bet_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                        RETURNING *
                    `, [
                        userId,
                        accountId,
                        betData.match_id,
                        betData.bet_type,
                        betData.bet_option,
                        betData.bet_amount,
                        betData.odds,
                        hasMinOdds ? effectiveMinOdds : null,
                        officialOddsToPersist,
                        betData.single_limit || betData.bet_amount,
                        betData.interval_seconds || 3,
                        betData.quantity || 1,
                        betStatus,
                        officialBetId
                    ]);

                    try {
                        const financial = await automation.getAccountFinancialSummary(accountId);
                        if (financial.balance !== null) {
                            await query(
                                `UPDATE crown_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                                [financial.balance, accountId]
                            );
                        }
                        accountBalanceAfter = financial.balance ?? null;
                        accountCreditAfter = financial.credit ?? null;
                    } catch (e) {
                        console.warn('下注成功后更新皇冠余额失败:', { accountId, error: (e as any)?.message || e });
                    }

                    return {
                        success: true,
                        accountId,
                        bet: {
                            ...result.rows[0],
                            crown_result: betResult,
                            account_balance_after: accountBalanceAfter,
                            account_credit_after: accountCreditAfter,
                        }
                    };
                } else {
                    console.warn(`账号 ${accountId} 下单失败: ${betResult.message || '未知错误'}`);
                    return {
                        success: false,
                        accountId,
                        error: betResult.message || '下注失败'
                    };
                }

            } catch (accountError: any) {
                console.error(`账号 ${accountId} 下注失败:`, accountError);
                return {
                    success: false,
                    accountId,
                    error: accountError.message || '下注失败'
                };
            }
        });

        // 等待所有下注完成
        const betResults = await Promise.all(betPromises);

        // 处理结果
        for (const result of betResults) {
            if (result.success && result.bet) {
                allBetsFailed = false;
                createdBets.push(result.bet);
            } else if (!result.success) {
                failedBets.push({
                    accountId: result.accountId,
                    error: result.error || '下注失败'
                });
            }
        }

        // ========== 新增：如果所有下注都失败，退回金币 ==========
        if (allBetsFailed) {
            const refundBalance = await query(
                'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
                [userId]
            );
            const refundBalanceBefore = parseFloat(refundBalance.rows[0].balance);

            const refundTransactionId = `BET_REFUND_${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
            await query(`
                INSERT INTO coin_transactions (
                    user_id, transaction_id, transaction_type,
                    description, amount, balance_before, balance_after
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                userId,
                refundTransactionId,
                '返还',
                `下注失败退款 - ${betData.bet_type} ${betData.bet_option}`,
                totalBetAmount,
                refundBalanceBefore,
                refundBalanceBefore + totalBetAmount
            ]);

            console.log(`⚠️  所有下注失败，金币已退回：用户${userId}，金额${totalBetAmount}`);
        }
        // ========== 退款逻辑结束 ==========

        // 返回结果，包括成功和失败的信息
        const totalRequested = validatedAccountIds.length;
        const successCount = createdBets.length;
        const failCount = failedBets.length;

        res.status(createdBets.length > 0 ? 201 : 400).json({
            success: successCount > 0,
            data: {
                bets: createdBets,
                failed: failedBets,
                stats: {
                    total: totalRequested,
                    success: successCount,
                    failed: failCount
                },
                refunded: allBetsFailed ? totalBetAmount : 0
            },
            message: successCount > 0
                ? `成功下注 ${successCount}/${totalRequested} 个账号${failCount > 0 ? `，${failCount} 个失败` : ''}`
                : `全部下注失败 (${failCount}/${totalRequested})，已退回 ${totalBetAmount} 金币`
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
        console.log(`🔍 [Sync] 开始同步结算，用户ID: ${userId}, 角色: ${userRole}`);

        const accountIdsRaw = Array.isArray(req.body?.account_ids) ? req.body.account_ids : undefined;
        const accountIds = accountIdsRaw
            ? accountIdsRaw
                .map((id: any) => Number(id))
                .filter((id: number) => Number.isInteger(id))
            : undefined;
        console.log(`🔍 [Sync] 账号ID过滤: ${accountIds ? accountIds.join(', ') : '无'}`);

        // 阶段一：为“待处理且无官网单号”的注单尝试补齐官网单号并标记为已下单
        try {
            const confirmParams: any[] = [];
            let confirmSql = `
                SELECT b.*, ca.discount
                FROM bets b
                JOIN crown_accounts ca ON ca.id = b.account_id
                WHERE 1=1
                  AND b.status = 'pending'
                  AND (b.official_bet_id IS NULL OR b.official_bet_id = '')
            `;
            if (userRole === 'admin') {
                // no additional filter
            } else if (userRole === 'agent') {
                confirmSql += ` AND (b.user_id = $${confirmParams.length + 1} OR b.user_id IN (SELECT id FROM users WHERE agent_id = $${confirmParams.length + 1}))`;
                confirmParams.push(userId);
            } else {
                confirmSql += ` AND b.user_id = $${confirmParams.length + 1}`;
                confirmParams.push(userId);
            }
            if (accountIds && accountIds.length > 0) {
                confirmSql += ` AND b.account_id = ANY($${confirmParams.length + 1})`;
                confirmParams.push(accountIds);
            }
            confirmSql += ' ORDER BY b.created_at ASC';

            const toConfirmResult = await query(confirmSql, confirmParams);
            const pendingNoIdBets = toConfirmResult.rows as Array<any>;

            if (pendingNoIdBets.length > 0) {
                const automation = getCrownAutomation();
                const parseAmount = (value?: string | null): number | null => {
                    if (!value) return null;
                    const cleaned = value.replace(/[^0-9.\-]/g, '');
                    if (!cleaned) return null;
                    const num = parseFloat(cleaned);
                    return Number.isFinite(num) ? num : null;
                };

                const confirmByAccount = new Map<number, any[]>();
                for (const bet of pendingNoIdBets) {
                    const accId = Number(bet.account_id);
                    if (!confirmByAccount.has(accId)) confirmByAccount.set(accId, []);
                    confirmByAccount.get(accId)!.push(bet);
                }

                for (const [accountId, bets] of confirmByAccount.entries()) {
                    if (!automation.isAccountOnline(accountId)) {
                        continue;
                    }
                    let items: any[] = [];
                    try {
                        items = await automation.fetchTodayWagers(accountId);
                    } catch {
                        continue;
                    }
                    const pool = items
                        .filter(it => it && it.ticketId && (!it.winGold || !/[0-9]/.test(String(it.winGold))))
                        .map(it => ({ ticketId: String(it.ticketId), gold: parseAmount(it.gold) }))
                        .filter(it => typeof it.gold === 'number');

                    const usedTickets = new Set<string>();
                    for (const bet of bets) {
                        const discount = Number(bet.discount) || 1;
                        const crownStake = parseFloat((Number(bet.bet_amount) / discount).toFixed(2));
                        const candidate = pool.find(it => !usedTickets.has(it.ticketId) && Math.abs((it.gold as number) - crownStake) < 0.01);
                        if (candidate) {
                            const upd = await query(`
                                UPDATE bets SET official_bet_id = $1, status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                                WHERE id = $2 AND user_id = $3
                                RETURNING id
                            `, [candidate.ticketId, bet.id, userId]);
                            if (upd.rowCount && upd.rowCount > 0) {
                                usedTickets.add(candidate.ticketId);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('同步前的确认阶段出现异常(忽略继续结算)：', (e as any)?.message || e);
        }


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

        console.log(`📊 [Sync] 查询到 ${pendingBets.length} 条待结算注单 (userId=${userId}, role=${userRole})`);

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

        // 初始化结果数组
        const automation = getCrownAutomation();
        const updatedBets: Array<{ id: number; ticketId: string; status: string; result: string; payout: number; profit_loss: number }>
            = [];
        const errors: Array<{ accountId: number; error: string }> = [];
        const skipped: Array<{ betId: number; reason: string }> = [];

        // 按账号和日期分组
        const groupByAccountAndDate = new Map<string, { accountId: number; date: string; bets: any[] }>();
        for (const bet of pendingBets) {
            const accId = Number(bet.account_id);
            // 从 created_at 提取日期 (YYYY-MM-DD)
            const betDate = bet.created_at ? new Date(bet.created_at).toISOString().split('T')[0] : null;
            if (!betDate) {
                console.log(`⚠️  [Sync] 注单 ${bet.id} 没有创建日期，跳过`);
                skipped.push({ betId: bet.id, reason: '没有创建日期' });
                continue;
            }

            const key = `${accId}_${betDate}`;
            if (!groupByAccountAndDate.has(key)) {
                groupByAccountAndDate.set(key, { accountId: accId, date: betDate, bets: [] });
            }
            groupByAccountAndDate.get(key)!.bets.push(bet);
        }

        console.log(`📋 [Sync] 按账号和日期分组: ${Array.from(groupByAccountAndDate.keys()).join(', ')}`);

        for (const [key, group] of groupByAccountAndDate.entries()) {
            const { accountId, date, bets } = group;
            console.log(`🔄 [Sync] 开始处理账号 ${accountId}，日期 ${date}，共 ${bets.length} 条注单`);

            // 移除 isAccountOnline 检查，让 fetchTodayWagers 自己处理登录状态
            // fetchTodayWagers 内部已经有自动重新登录的逻辑

            let wagers;
            try {
                console.log(`📞 [Sync] 调用 fetchTodayWagers(${accountId}, ${date})...`);
                wagers = await automation.fetchTodayWagers(accountId, date);
                console.log(`✅ [Sync] fetchTodayWagers(${accountId}, ${date}) 返回 ${wagers.length} 条注单`);
            } catch (fetchError: any) {
                console.log(`❌ [Sync] fetchTodayWagers(${accountId}, ${date}) 失败:`, fetchError.message || fetchError);
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

                // 数据库中存储的是不带 "OU" 前缀的数字，API 返回的是带 "OU" 前缀的
                // 尝试两种格式匹配
                let wager = wagerMap.get(ticketIdRaw);
                if (!wager && !ticketIdRaw.startsWith('OU')) {
                    wager = wagerMap.get(`OU${ticketIdRaw}`);
                }
                if (!wager) {
                    // 官网未找到对应注单，标记为已取消
                    console.log(`⚠️  [Sync] 注单 ${bet.id} (票号: ${ticketIdRaw}) 官网未找到，标记为已取消`);
                    try {
                        await query(
                            `
                            UPDATE bets SET
                                status = $1,
                                result = $2,
                                payout = $3,
                                profit_loss = $4,
                                score = $5,
                                settled_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $6 AND user_id = $7
                            RETURNING id
                            `,
                            ['settled', 'cancelled', parseFloat(bet.bet_amount), 0, null, bet.id, userId]
                        );
                        updatedBets.push({
                            id: bet.id,
                            ticketId: ticketIdRaw,
                            status: 'settled',
                            result: 'cancelled',
                            payout: parseFloat(bet.bet_amount),
                            profit_loss: 0
                        });
                        console.log(`✅ [Sync] 注单 ${bet.id} 已标记为已取消`);
                    } catch (updateError: any) {
                        console.error(`❌ [Sync] 更新注单 ${bet.id} 失败:`, updateError.message);
                        skipped.push({ betId: bet.id, reason: `更新失败: ${updateError.message}` });
                    }
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
                        score = $5,
                        settled_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $6 AND user_id = $7
                    RETURNING id
                `, [status, result, payout, profitLoss, wager.ballActRet || null, bet.id, userId]);

                if (updateResult.rows.length === 0) {
                    skipped.push({ betId: bet.id, reason: '更新注单失败' });
                    continue;
                }

                // ========== 修改：只有划单（cancelled）才返还金币 ==========
                // 正常的输赢不返还金币，金币是"使用工具下注的权限费用"
                if (status === 'cancelled' && result === 'cancelled') {
                    // 检查是否已返还过
                    const existingRefund = await query(
                        `SELECT id FROM coin_transactions WHERE bet_id = $1 AND transaction_type = '返还' LIMIT 1`,
                        [bet.id]
                    );

                    if (existingRefund.rows.length === 0) {
                        // 返还下注时扣除的金币（bet_amount）
                        const refundAmount = Number(bet.bet_amount) || 0;
                        if (refundAmount > 0) {
                            const transactionId = `CANCEL_REFUND_${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
                            const balanceBeforeResult = await query(
                                'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
                                [userId]
                            );
                            const balanceBefore = parseFloat(balanceBeforeResult.rows[0]?.balance || '0');
                            const balanceAfter = roundTo(balanceBefore + refundAmount, 2);

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
                                `划单退款 - ${bet.bet_type} ${bet.bet_option}`,
                                refundAmount,
                                balanceBefore,
                                balanceAfter
                            ]);

                            console.log(`✅ 划单退款：注单${bet.id}，用户${userId}，金额${refundAmount}`);
                        }
                    }
                }
                // ========== 返还逻辑结束 ==========

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
        if (status === 'settled' && payout > 0) {
            const transactionId = `PAYOUT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

            const balanceResult = await query(
                'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
                [userId]
            );
            const currentBalance = parseFloat(balanceResult.rows[0].balance);

            await query(`
                INSERT INTO coin_transactions (
                    user_id, account_id, bet_id, transaction_id, transaction_type,
                    description, amount, balance_before, balance_after
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                userId,
                bet.account_id,
                betId,
                transactionId,
                '返还',
                `下注派彩 - ${bet.bet_type} ${bet.bet_option}`,
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

// 获取定时任务状态
router.get('/scheduler/status', async (req: any, res) => {
    try {
        const scheduler = getBetSettlementScheduler();
        const status = scheduler.getStatus();

        res.json({
            success: true,
            data: status
        } as ApiResponse);
    } catch (error) {
        console.error('获取定时任务状态错误:', error);
        res.status(500).json({
            success: false,
            error: '获取定时任务状态失败'
        } as ApiResponse);
    }
});

export { router as betRoutes };
