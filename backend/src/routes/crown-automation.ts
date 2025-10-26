import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../models/database';
import { ApiResponse } from '../types';
import { getCrownAutomation } from '../services/crown-automation';
import type { Response } from 'express';

const buildAccountAccess = (user: any, options?: { includeDisabled?: boolean }) => {
    const includeDisabled = options?.includeDisabled ?? false;
    let clause = includeDisabled ? '' : ' AND ca.is_enabled = true';
    const params: any[] = [];

    if (user.role === 'admin') {
        // 管理员可访问全部账号
    } else if (user.role === 'agent') {
        clause += ` AND (ca.user_id = $${params.length + 2} OR ca.user_id IN (SELECT id FROM users WHERE agent_id = $${params.length + 2}))`;
        params.push(user.id);
    } else {
        clause += ` AND ca.user_id = $${params.length + 2}`;
        params.push(user.id);
    }

    return { clause, params };
};

const router = Router();
router.use(authenticateToken);

// 登录皇冠账号
router.post('/login/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: false });
        const accountResult = await query(
            `SELECT ca.* FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在或已禁用'
            });
        }

        const account = accountResult.rows[0];

        // 检查账号是否已经在线
        if (getCrownAutomation().isAccountOnline(accountId)) {
            return res.json({
                success: true,
                message: '账号已在线',
                data: { accountId, status: 'online' }
            } as ApiResponse);
        }

        // 执行登录
        const loginResult = await getCrownAutomation().loginAccount(account);

        if (loginResult.success) {
            await query(
                `UPDATE crown_accounts
                 SET last_login_at = CURRENT_TIMESTAMP,
                     is_online = true,
                     status = 'active',
                     error_message = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [accountId]
            );
        } else {
            await query(
                `UPDATE crown_accounts
                 SET is_online = false,
                     status = 'error',
                     error_message = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [accountId, (loginResult.message || '登录失败').slice(0, 255)]
            );
        }

        res.json({
            success: loginResult.success,
            message: loginResult.message,
            data: {
                accountId,
                status: loginResult.success ? 'online' : 'offline',
                sessionInfo: loginResult.sessionInfo
            }
        } as ApiResponse);

    } catch (error) {
        console.error('登录皇冠账号错误:', error);
        res.status(500).json({
            success: false,
            error: '登录失败'
        });
    }
});

// 首次登录改密（初始化皇冠账号）
router.post('/initialize/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId, 10);
        const { username: newUsername, password: newPassword } = req.body || {};

        if (!newUsername || typeof newUsername !== 'string' || newUsername.trim().length < 4) {
            return res.status(400).json({
                success: false,
                error: '请提供长度至少4个字符的新账号',
            });
        }

        if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
            return res.status(400).json({
                success: false,
                error: '请提供长度至少6个字符的新密码',
            });
        }

        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.* FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在或无权限'
            });
        }

        const account = accountResult.rows[0];

        const automation = getCrownAutomation();
        const initResult = await automation.initializeAccountCredentials(account, {
            username: newUsername.trim(),
            password: newPassword.trim(),
        });

        if (!initResult.success) {
            console.warn('初始化账号失败:', initResult.message, initResult);
            return res.status(400).json({
                success: false,
                error: initResult.message || '初始化失败'
            });
        }

        const finalUsername = initResult.updatedCredentials.username.trim();
        const finalPassword = initResult.updatedCredentials.password.trim();

        // 保存原始账号（如果还没保存过）
        const originalUsername = account.original_username || account.username;

        await query(
            `UPDATE crown_accounts
               SET username = $1,
                   password = $2,
                   original_username = COALESCE(original_username, $4),
                   initialized_username = $1,
                   last_login_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP,
                   status = 'active',
                   error_message = NULL
             WHERE id = $3`,
            [finalUsername, finalPassword, accountId, originalUsername]
        );

        res.json({
            success: true,
            message: initResult.message || '账号初始化成功',
            data: {
                username: finalUsername,
                password: finalPassword,
            },
        } as ApiResponse);

    } catch (error) {
        console.error('皇冠账号初始化失败:', error);
        res.status(500).json({
            success: false,
            error: '初始化失败'
        });
    }
});

// 登出皇冠账号
router.post('/logout/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        // 执行登出
        const logoutResult = await getCrownAutomation().logoutAccount(accountId);

        if (logoutResult) {
            await query(
                `UPDATE crown_accounts
                 SET is_online = false,
                     status = 'active',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [accountId]
            );
        }

        res.json({
            success: logoutResult,
            message: logoutResult ? '登出成功' : '登出失败',
            data: { accountId, status: 'offline' }
        } as ApiResponse);

    } catch (error) {
        console.error('登出皇冠账号错误:', error);
        res.status(500).json({
            success: false,
            error: '登出失败'
        });
    }
});

// 执行自动下注
router.post('/bet/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);
        const {
            betType,
            betOption,
            amount,
            odds,
            matchId,
            match_id,
            crownMatchId,
            crown_match_id,
            homeTeam,
            home_team,
            awayTeam,
            away_team,
            min_odds,
        } = req.body;

        const matchDbId = matchId ?? match_id;
        const crownMatch = crownMatchId ?? crown_match_id;
        const homeTeamName = homeTeam ?? home_team;
        const awayTeamName = awayTeam ?? away_team;

        if (!matchDbId && !crownMatch && (!homeTeamName || !awayTeamName)) {
            return res.status(400).json({
                success: false,
                error: '缺少比赛信息（需要数据库比赛ID、皇冠比赛ID或主客队名称）'
            });
        }

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user);
        const accountResult = await query(
            `SELECT ca.* FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在或已禁用'
            });
        }

        // 检查账号是否在线
        const automation = getCrownAutomation();

        if (!automation.isAccountOnline(accountId)) {
            return res.status(400).json({
                success: false,
                error: '账号未登录，请先登录'
            });
        }

        // 验证下注参数
        if (!betType || !betOption || amount === undefined || amount === null || amount <= 0 || !odds) {
            return res.status(400).json({
                success: false,
                error: '下注参数不完整'
            });
        }

        const account = accountResult.rows[0];
        const discount = account.discount || 1;
        if (discount <= 0) {
            return res.status(400).json({
                success: false,
                error: '账号折扣设置不正确',
            });
        }

        const platformAmount = amount;
        const crownAmount = parseFloat((platformAmount / discount).toFixed(2));
        const parsedMinOdds = min_odds !== undefined && min_odds !== null ? Number(min_odds) : undefined;
        const normalizedMinOdds = Number.isFinite(parsedMinOdds) && (parsedMinOdds as number) > 0 ? (parsedMinOdds as number) : undefined;
        const targetGid = crownMatch ? String(crownMatch) : undefined;

        if (normalizedMinOdds !== undefined && !targetGid) {
            return res.status(400).json({
                success: false,
                error: '缺少皇冠比赛ID，无法校验最低赔率'
            });
        }

        let previewOdds: number | undefined;
        if (normalizedMinOdds !== undefined && Number.isFinite(normalizedMinOdds)) {
            const preview = await automation.previewBetOdds(accountId, {
                betType,
                betOption,
                amount: crownAmount,
                odds,
                min_odds: normalizedMinOdds,
                match_id: matchDbId !== undefined ? Number(matchDbId) : undefined,
                matchId: matchDbId !== undefined ? Number(matchDbId) : undefined,
                gid: targetGid,
                crown_match_id: targetGid,
                crownMatchId: targetGid,
                home_team: homeTeamName,
                away_team: awayTeamName,
            });
            if (!preview.success || typeof preview.odds !== 'number') {
                return res.status(400).json({
                    success: false,
                    error: preview.error || '无法获取官方赔率'
                });
            }
            previewOdds = preview.odds;
            if (previewOdds < normalizedMinOdds) {
                return res.status(400).json({
                    success: false,
                    error: `当前官方赔率 ${previewOdds.toFixed(3)} 低于最低赔率 ${normalizedMinOdds.toFixed(3)}`
                });
            }
        }

        // 执行下注
        const betResult = await automation.placeBet(accountId, {
            betType,
            betOption,
            amount: crownAmount,
            odds,
            min_odds: normalizedMinOdds,
            platformAmount,
            discount,
            match_id: matchDbId !== undefined ? Number(matchDbId) : undefined,
            matchId: matchDbId !== undefined ? Number(matchDbId) : undefined,
            gid: targetGid,
            crown_match_id: crownMatch,
            home_team: homeTeamName,
            away_team: awayTeamName,
        });

        // 下注成功后同步更新皇冠余额
        let balanceAfter: number | null = null;
        let creditAfter: number | null = null;
        if (betResult.success) {
            try {
                const financial = await automation.getAccountFinancialSummary(accountId);
                if (financial.balance !== null) {
                    await query(
                        `UPDATE crown_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                        [financial.balance, accountId]
                    );
                }
                balanceAfter = financial.balance ?? null;
                creditAfter = financial.credit ?? null;
            } catch (e) {
                console.warn('下注成功后更新皇冠余额失败:', { accountId, error: (e as any)?.message || e });
            }
        }


        // 如果下注成功，更新数据库中的下注记录
        if (betResult.success && betResult.betId) {
            // 这里可以更新对应的bet记录，添加official_bet_id
            // await query(
            //     'UPDATE bets SET official_bet_id = $1, status = $2 WHERE id = $3',
            //     [betResult.betId, 'confirmed', someBetId]
            // );
        }

        res.json({
            success: betResult.success,
            message: betResult.message,
            data: {
                accountId,
                betId: betResult.betId,
                platformAmount,
                crownAmount,
                discount,
                balanceAfter,
                creditAfter,
            }
        } as ApiResponse);

    } catch (error) {
        console.error('自动下注错误:', error);
        res.status(500).json({
            success: false,
            error: '下注失败'
        });
    }
});

// 预览官方赔率（用于默认最低赔率）
router.post('/preview-odds', async (req: any, res) => {
    try {
        const { match_id, crown_match_id, bet_type, bet_option } = req.body || {};

        if (!bet_type || !bet_option) {
            return res.status(400).json({
                success: false,
                error: '缺少投注类型或选项'
            });
        }

        let crownMatchId: string | undefined = typeof crown_match_id === 'string' && crown_match_id.trim().length > 0
            ? crown_match_id.trim()
            : undefined;

        if (!crownMatchId && typeof match_id === 'number') {
            const matchResult = await query('SELECT match_id FROM matches WHERE id = $1', [match_id]);
            if (matchResult.rows.length > 0 && matchResult.rows[0].match_id) {
                crownMatchId = String(matchResult.rows[0].match_id);
            }
        }

        if (!crownMatchId) {
            return res.status(400).json({
                success: false,
                error: '缺少皇冠比赛ID，无法获取官方赔率'
            });
        }

        const automation = getCrownAutomation();
        const result = await automation.previewMatchOdds({
            betType: bet_type,
            betOption: bet_option,
            amount: 0,
            odds: 0,
            crown_match_id: crownMatchId,
            crownMatchId,
            gid: crownMatchId,
        });

        if (!result.success || typeof result.odds !== 'number') {
            return res.status(400).json({
                success: false,
                error: result.error || '获取官方赔率失败'
            });
        }

        res.json({
            success: true,
            data: {
                odds: result.odds,
                source: 'system'
            }
        } as ApiResponse);
    } catch (error) {
        console.error('预览官方赔率失败:', error);
        res.status(500).json({
            success: false,
            error: '获取官方赔率失败'
        });
    }
});

// 获取账号余额
router.get('/balance/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        // 检查账号是否在线
        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({
                success: false,
                error: '账号未登录，无法获取余额'
            });
        }

        const financial = await getCrownAutomation().getAccountFinancialSummary(accountId);

        // 如果获取到余额，更新数据库
        if (financial.balance !== null) {
            await query(
                `UPDATE crown_accounts
                 SET balance = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [financial.balance, accountId]
            );
        }

        // 只要有余额或额度数据就算成功
        const success = financial.balance !== null || financial.credit !== null;

        res.json({
            success,
            message: success ? '获取余额成功' : '获取余额失败',
            data: {
                accountId,
                balance: financial.balance ?? 0,
                credit: financial.credit ?? 0,
                balance_source: financial.balanceSource,
                credit_source: financial.creditSource,
                timestamp: new Date().toISOString()
            }
        } as ApiResponse);

    } catch (error) {
        console.error('获取账号余额错误:', error);
        res.status(500).json({
            success: false,
            error: '获取余额失败'
        });
    }
});

// 获取账号历史总览
router.get('/history/:accountId', async (req: any, res) => {
    try {
        const accountId = parseInt(req.params.accountId);
        const { startDate, endDate, sportType } = req.query;

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            } as ApiResponse);
        }

        // 检查账号是否在线
        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({
                success: false,
                error: '账号未登录，无法获取历史数据'
            } as ApiResponse);
        }

        const result = await getCrownAutomation().getAccountHistory(accountId, {
            startDate: startDate as string,
            endDate: endDate as string,
            sportType: sportType as string,
        });

        res.json({
            success: result.success,
            data: result.data,
            total: result.total,
            error: result.error,
        } as ApiResponse);

    } catch (error) {
        console.error('获取账号历史错误:', error);
        res.status(500).json({
            success: false,
            error: '获取历史数据失败'
        } as ApiResponse);
    }
});


// 获取自动化状态
router.get('/status', async (req: any, res) => {
    try {
        const userId = req.user.id;

        // 获取用户的所有账号
        const accountsResult = await query(
            'SELECT id, username, display_name FROM crown_accounts WHERE user_id = $1 AND is_enabled = true',
            [userId]
        );

        const automation = getCrownAutomation();

        const accounts = accountsResult.rows.map(account => ({
            id: account.id,
            username: account.username,
            display_name: account.display_name,
            online: automation.isAccountOnline(account.id)
        }));

        res.json({
            success: true,
            data: {
                activeSessionCount: automation.getActiveSessionCount(),
                accounts,
                systemStatus: automation.getSystemStatus()
            }
        } as ApiResponse);

    } catch (error) {
        console.error('获取自动化状态错误:', error);
        res.status(500).json({
            success: false,
            error: '获取状态失败'
        });
    }
});

// 检查账号当前出口IP（用于验证代理是否生效）
router.get('/proxy-ip/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);

        // 验证账号归属
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }

        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({ success: false, error: '账号未登录，无法检测IP' });
        }

        const ip = await getCrownAutomation().getExternalIP(accountId);
        res.json({
            success: !!ip,
            data: { ip },
            message: ip ? '获取出口IP成功' : '获取出口IP失败'
        });
    } catch (error) {
        console.error('获取出口IP接口错误:', error);
        res.status(500).json({ success: false, error: '获取出口IP失败' });
    }
});

// 批量登录账号
router.post('/batch-login', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const { accountIds } = req.body;

        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请选择要登录的账号'
            });
        }

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user);
        const accountsResult = await query(
            `SELECT ca.* FROM crown_accounts ca
             WHERE ca.id = ANY($1)${access.clause}`,
            [accountIds, ...access.params]
        );

        if (accountsResult.rows.length !== accountIds.length) {
            return res.status(400).json({
                success: false,
                error: '部分账号不存在或已禁用'
            });
        }

        const results = [];

        // 逐个登录账号（避免并发过多导致检测）
        for (const account of accountsResult.rows) {
            try {
                const loginResult = await getCrownAutomation().loginAccount(account);
                results.push({
                    accountId: account.id,
                    username: account.username,
                    success: loginResult.success,
                    message: loginResult.message
                });

                if (loginResult.success) {
                    await query(
                        `UPDATE crown_accounts
                         SET last_login_at = CURRENT_TIMESTAMP,
                             is_online = true,
                             status = 'active',
                             error_message = NULL,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1`,
                        [account.id]
                    );
                } else {
                    await query(
                        `UPDATE crown_accounts
                         SET is_online = false,
                             status = 'error',
                             error_message = $2,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1`,
                        [account.id, (loginResult.message || '登录失败').slice(0, 255)]
                    );
                }

                await new Promise(resolve => setTimeout(resolve, 3000));

            } catch (error) {
                results.push({
                    accountId: account.id,
                    username: account.username,
                    success: false,
                    message: `登录出错: ${error instanceof Error ? error.message : error}`
                });

                await query(
                    `UPDATE crown_accounts
                     SET is_online = false,
                         status = 'error',
                         error_message = $2,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [account.id, error instanceof Error ? error.message.slice(0, 255) : '登录出错']
                );
            }
        }

        const successCount = results.filter(r => r.success).length;

        res.json({
            success: true,
            message: `批量登录完成，成功 ${successCount}/${results.length} 个账号`,
            data: { results, successCount, totalCount: results.length }
        } as ApiResponse);

    } catch (error) {
        console.error('批量登录错误:', error);
        res.status(500).json({
            success: false,
            error: '批量登录失败'
        });
    }
});

// 批量登出账号
router.post('/batch-logout', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const { accountIds } = req.body;

        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请选择要登出的账号'
            });
        }

        // 验证账号是否属于当前用户
        const accountsResult = await query(
            'SELECT id, username FROM crown_accounts WHERE id = ANY($1) AND user_id = $2',
            [accountIds, userId]
        );

        const results = [];

        for (const account of accountsResult.rows) {
            const logoutResult = await getCrownAutomation().logoutAccount(account.id);
            results.push({
                accountId: account.id,
                username: account.username,
                success: logoutResult
            });

            if (logoutResult) {
                await query(
                    `UPDATE crown_accounts
                     SET is_online = false,
                         status = 'active',
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [account.id]
                );
            }
        }

        const successCount = results.filter(r => r.success).length;

        res.json({
            success: true,
            message: `批量登出完成，成功 ${successCount}/${results.length} 个账号`,
            data: { results, successCount, totalCount: results.length }
        } as ApiResponse);

    } catch (error) {
        console.error('批量登出错误:', error);
        res.status(500).json({
            success: false,
            error: '批量登出失败'
        });
    }
});

// 获取账号额度（maxcredit），并回写到数据库 balance 字段
router.get('/credit/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        // 需在线才可抓取额度
        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({
                success: false,
                error: '账号未登录，无法获取额度'
            });
        }

        const credit = await getCrownAutomation().getAccountCredit(accountId);

        if (credit !== null) {
            await query(
                `UPDATE crown_accounts
                 SET balance = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [credit, accountId]
            );
        }

        res.json({
            success: credit !== null,
            message: credit !== null ? '获取额度成功' : '获取额度失败',
            data: {
                accountId,
                credit: credit || 0,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('获取账号额度错误:', error);
        res.status(500).json({
            success: false,
            error: '获取额度失败'
        });
    }
});

// 抓取赛事列表（直接从皇冠返回并解析基础字段）
router.get('/matches/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);
        const { gtype = 'ft', showtype = 'live', rtype = 'rb', ltype = '3', sorttype = 'L' } = req.query as any;

        // 验证账号归属
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }

        // 不再强制要求在线。服务层会在必要时自动尝试登录后再抓取。
        const effectiveRtype = String(rtype || (String(showtype) === 'live' ? 'rb' : 'r'));
        const { matches, xml } = await getCrownAutomation().fetchMatches(accountId, {
            gtype: String(gtype),
            showtype: String(showtype),
            rtype: effectiveRtype,
            ltype: String(ltype),
            sorttype: String(sorttype),
        });

        res.json({
            success: true,
            data: { matches, meta: { gtype, showtype, rtype: effectiveRtype, ltype, sorttype }, raw: xml }
        });

    } catch (error) {
        console.error('抓取赛事接口错误:', error);
        res.status(500).json({ success: false, error: '抓取赛事失败' });
    }
});

// 抓取赛事列表（系统默认账号）
router.get('/matches-system', async (req: any, res) => {
    try {
        const userId = req.user.id;
        // 任意已登录用户均可使用系统赛事抓取，无需绑定账号
        const { gtype = 'ft', showtype = 'live', rtype = 'rb', ltype = '3', sorttype = 'L' } = req.query as any;

        const { matches, xml } = await getCrownAutomation().fetchMatchesSystem({
            gtype: String(gtype),
            showtype: String(showtype),
            rtype: String(rtype || (String(showtype) === 'live' ? 'rb' : 'r')),
            ltype: String(ltype),
            sorttype: String(sorttype),
        });

        res.json({ success: true, data: { matches, meta: { gtype, showtype, rtype, ltype, sorttype }, raw: xml } });
    } catch (error) {
        console.error('系统抓取赛事接口错误:', error);
        res.status(500).json({ success: false, error: '抓取赛事失败' });
    }
});

// 抓取赛事并落库到 matches 表
router.post('/matches/sync/:accountId', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);
        const { gtype = 'ft', showtype = 'live', rtype, ltype = '3', sorttype = 'L' } = req.query as any;

        // 验证账号归属
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }
        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({ success: false, error: '账号未登录，无法抓取赛事' });
        }

        const effectiveRtype = String(rtype || (String(showtype) === 'live' ? 'rb' : 'r'));
        const { matches } = await getCrownAutomation().fetchMatches(accountId, {
            gtype: String(gtype),
            showtype: String(showtype),
            rtype: effectiveRtype,
            ltype: String(ltype),
            sorttype: String(sorttype),
        });

        const parseTime = (s?: string): string | null => {
            if (!s) return null;
            const m = s.match(/(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})([ap])/i);
            if (!m) return null;
            const now = new Date();
            const y = now.getFullYear();
            const month = parseInt(m[1], 10) - 1;
            const day = parseInt(m[2], 10);
            let hh = parseInt(m[3], 10);
            const mm = parseInt(m[4], 10);
            const ap = m[5].toLowerCase();
            if (ap === 'p' && hh < 12) hh += 12;
            if (ap === 'a' && hh === 12) hh = 0;
            const d = new Date(y, month, day, hh, mm, 0);
            return isNaN(d.getTime()) ? null : d.toISOString();
        };

        let upserted = 0;
        for (const m of matches || []) {
            const match_id = String(m.gid || '').trim();
            if (!match_id) continue;
            const league = (m.league || '').toString().slice(0, 200);
            const home = (m.home || '').toString().slice(0, 100);
            const away = (m.away || '').toString().slice(0, 100);
            const when = parseTime(m.time) || new Date().toISOString();
            const status = String(showtype) === 'live' ? 'live' : 'scheduled';
            const current_score = (m.score || '').toString().slice(0, 20);
            const match_period = [m.period, m.clock].filter(Boolean).join(' ');
            const markets = JSON.stringify(m.markets || {});

            const result = await query(
                `INSERT INTO matches (match_id, league_name, home_team, away_team, match_time, status, current_score, match_period, markets, last_synced_at, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                 ON CONFLICT (match_id) DO UPDATE SET
                   league_name = EXCLUDED.league_name,
                   home_team = EXCLUDED.home_team,
                   away_team = EXCLUDED.away_team,
                   match_time = EXCLUDED.match_time,
                   status = EXCLUDED.status,
                   current_score = EXCLUDED.current_score,
                   match_period = EXCLUDED.match_period,
                   markets = EXCLUDED.markets,
                   last_synced_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
                 RETURNING id` ,
                [match_id, league, home, away, when, status, current_score, match_period, markets]
            );
            const matchDbId = result.rows[0]?.id;
            if (matchDbId) {
                await query(
                    `INSERT INTO match_odds_history (match_id, markets)
                     VALUES ($1, $2)`,
                    [matchDbId, markets]
                );
            }
            upserted += 1;
        }

        res.json({ success: true, message: `已同步 ${upserted} 条赛事到本地` });
    } catch (error) {
        console.error('同步赛事错误:', error);
        res.status(500).json({ success: false, error: '同步赛事失败' });
    }
});

export { router as crownAutomationRoutes };

// =============== SSE 实时赛事推送（按账号+参数聚合轮询） ===============
type StreamParams = { accountId: number; gtype: string; showtype: string; rtype: string; ltype: string; sorttype: string };
type StreamKey = string;

interface StreamGroup {
  clients: Set<Response>;
  timer?: NodeJS.Timeout;
  lastHash?: string;
  polling?: boolean;
  params: StreamParams;
}

const streamGroups: Map<StreamKey, StreamGroup> = new Map();

const makeKey = (p: StreamParams): StreamKey => {
  return `${p.accountId}|${p.gtype}|${p.showtype}|${p.rtype}|${p.ltype}|${p.sorttype}`;
};

const simpleHash = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
};

const startPollingIfNeeded = (key: StreamKey) => {
  const group = streamGroups.get(key);
  if (!group || group.timer) return;
  const { params } = group;
  const interval = params.showtype === 'live' ? 3000 : 15000;

  const tick = async () => {
    const g = streamGroups.get(key);
    if (!g) return;
    if (g.polling) return; // 避免重入
    if (g.clients.size === 0) {
      if (g.timer) clearInterval(g.timer);
      streamGroups.delete(key);
      return;
    }
    g.polling = true;
    try {
      const { matches, xml } = await getCrownAutomation().fetchMatches(params.accountId, {
        gtype: params.gtype,
        showtype: params.showtype,
        rtype: params.rtype,
        ltype: params.ltype,
        sorttype: params.sorttype,
      });
      const raw = xml || '';
      const h = simpleHash(raw.slice(0, 5000)); // 简单去重
      if (h !== g.lastHash) {
        g.lastHash = h;
        const payload = JSON.stringify({
          matches,
          meta: params,
          ts: Date.now(),
        });
        for (const client of g.clients) {
          try {
            client.write(`event: matches\n`);
            client.write(`data: ${payload}\n\n`);
          } catch {
            // 写失败忽略，由 close 事件清理
          }
        }
      } else {
        // 心跳
        for (const client of g.clients) {
          try { client.write(`event: ping\n` + `data: ${Date.now()}\n\n`); } catch {}
        }
      }
    } catch (e) {
      for (const client of group.clients) {
        try {
          client.write(`event: status\n`);
          client.write(`data: ${JSON.stringify({ ok: false, error: 'fetch_failed' })}\n\n`);
        } catch {}
      }
    } finally {
      g.polling = false;
    }
  };

  group.timer = setInterval(tick, interval);
  // 立即触发一次，尽快返回首包
  tick().catch(() => undefined);
};

// SSE 入口：/api/crown-automation/matches/stream?accountId=1&gtype=ft&showtype=live&rtype=rb&ltype=3&sorttype=L&token=xxx
router.get('/matches/stream', async (req: any, res: Response) => {
  try {
    // SSE特殊处理：从URL参数获取token（因为EventSource不支持自定义头）
    const token = String(req.query.token || '');
    if (!token) {
      res.status(401).json({ success: false, error: '缺少token参数' });
      return;
    }

    // 验证token
    const jwt = require('jsonwebtoken');
    let user: any;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      user = { id: decoded.id, role: decoded.role };
    } catch (error) {
      res.status(401).json({ success: false, error: 'token无效或已过期' });
      return;
    }

    const userId = user.id;
    const accountId = parseInt(String(req.query.accountId || ''));
    const gtype = String(req.query.gtype || 'ft');
    const showtype = String(req.query.showtype || 'live');
    const rtype = String(req.query.rtype || (showtype === 'live' ? 'rb' : 'r'));
    const ltype = String(req.query.ltype || '3');
    const sorttype = String(req.query.sorttype || 'L');

    // 验证账号归属
        const access = buildAccountAccess(user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );
    if (accountResult.rows.length === 0) {
      res.status(404).json({ success: false, error: '账号不存在' });
      return;
    }

    // 设置 SSE 头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx 兼容
    });
    res.flushHeaders?.();
    res.write(`retry: 3000\n\n`);

    const params: StreamParams = { accountId, gtype, showtype, rtype, ltype, sorttype };
    const key = makeKey(params);
    let group = streamGroups.get(key);
    if (!group) {
      group = { clients: new Set<Response>(), params };
      streamGroups.set(key, group);
    }
    group.clients.add(res);

    // 初始状态通知
    res.write(`event: status\n`);
    res.write(`data: ${JSON.stringify({ ok: true, subscribed: key })}\n\n`);

    // 启动轮询
    startPollingIfNeeded(key);

    // 连接保持与清理
    req.on('close', () => {
      const g = streamGroups.get(key);
      if (!g) return;
      g.clients.delete(res);
      try { res.end(); } catch {}
      if (g.clients.size === 0) {
        if (g.timer) clearInterval(g.timer);
        streamGroups.delete(key);
      }
    });
  } catch (error) {
    console.error('SSE 订阅错误:', error);
    try {
      res.status(500).end();
    } catch {}
  }
});

// 设置账号是否用于赛事抓取
router.patch('/account/:accountId/fetch-config', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.accountId);
        const { useForFetch } = req.body;

        if (typeof useForFetch !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: '请提供有效的 useForFetch 参数'
            });
        }

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        // 更新配置
        await query(
            `UPDATE crown_accounts
             SET use_for_fetch = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [useForFetch, accountId]
        );

        if (useForFetch) {
            getCrownAutomation().triggerFetchWarmup();
        }

        res.json({
            success: true,
            message: useForFetch ? '已启用该账号用于赛事抓取' : '已禁用该账号用于赛事抓取',
            data: { accountId, useForFetch }
        } as ApiResponse);

    } catch (error) {
        console.error('设置赛事抓取配置错误:', error);
        res.status(500).json({
            success: false,
            error: '设置失败'
        });
    }
});

// 系统默认账号 SSE 推送
router.get('/matches/system/stream', async (req: any, res: Response) => {
  try {
    // SSE特殊处理：从URL参数获取token（因为EventSource不支持自定义头）
    const token = String(req.query.token || '');
    if (!token) {
      res.status(401).json({ success: false, error: '缺少token参数' });
      return;
    }

    // 验证token
    const jwt = require('jsonwebtoken');
    let userId: number;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      userId = decoded.id;
    } catch (error) {
      res.status(401).json({ success: false, error: 'token无效或已过期' });
      return;
    }

    const gtype = String(req.query.gtype || 'ft');
    const showtype = String(req.query.showtype || 'live');
    const rtype = String(req.query.rtype || (showtype === 'live' ? 'rb' : 'r'));
    const ltype = String(req.query.ltype || '3');
    const sorttype = String(req.query.sorttype || 'L');

    // 设置 SSE 头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(`retry: 3000\n\n`);

    const params: StreamParams = { accountId: 0, gtype, showtype, rtype, ltype, sorttype };
    const key = makeKey(params);
    let group = streamGroups.get(key);
    if (!group) {
      group = { clients: new Set<Response>(), params };
      streamGroups.set(key, group);
    }
    group.clients.add(res);

    // 初始状态
    res.write(`event: status\n`);
    res.write(`data: ${JSON.stringify({ ok: true, subscribed: key, system: true })}\n\n`);

    // 自定义轮询：调用系统抓取
    const interval = showtype === 'live' ? 3000 : 15000;
    let tm: NodeJS.Timeout | undefined;
    const tick = async () => {
      try {
        const { matches, xml } = await getCrownAutomation().fetchMatchesSystem({ gtype, showtype, rtype, ltype, sorttype });
        const payload = JSON.stringify({ matches, meta: { gtype, showtype, rtype, ltype, sorttype }, ts: Date.now() });
        res.write(`event: matches\n`);
        res.write(`data: ${payload}\n\n`);
      } catch (e) {
        try {
          res.write(`event: status\n`);
          res.write(`data: ${JSON.stringify({ ok: false, error: 'fetch_failed' })}\n\n`);
        } catch {}
      }
    };
    tm = setInterval(tick, interval);
    tick().catch(() => undefined);

    req.on('close', () => {
      try { if (tm) clearInterval(tm); } catch {}
      try { res.end(); } catch {}
      const g = streamGroups.get(key);
      if (g) {
        g.clients.delete(res);
        if (g.clients.size === 0 && g.timer) { clearInterval(g.timer); streamGroups.delete(key); }
      }
    });
  } catch (error) {
    console.error('SSE(系统) 订阅错误:', error);
    try { res.status(500).end(); } catch {}
  }
});
