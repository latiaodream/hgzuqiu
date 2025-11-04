import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../models/database';
import { ApiResponse } from '../types';
import { getCrownAutomation } from '../services/crown-automation';
import { getMatchFetcher } from '../services/match-fetcher';
import type { Response } from 'express';

const buildAccountAccess = (user: any, options?: { includeDisabled?: boolean }) => {
    const includeDisabled = options?.includeDisabled ?? false;
    let clause = includeDisabled ? '' : ' AND ca.is_enabled = true';
    const params: any[] = [];

    if (user.role === 'admin') {
        // 管理员可访问全部账号
    } else if (user.role === 'agent') {
        // 代理可以访问自己创建的账号 + 下属员工创建的账号
        clause += ` AND (ca.user_id = $${params.length + 2} OR ca.user_id IN (SELECT id FROM users WHERE agent_id = $${params.length + 2}))`;
        params.push(user.id);
    } else {
        // 员工可以访问同一代理下的所有账号（共享账号池）
        clause += ` AND ca.agent_id = $${params.length + 2}`;
        params.push(user.agent_id);
    }

    return { clause, params };
};

const router = Router();
router.use(authenticateToken);

const pickValue = (...values: any[]) => {
    for (const value of values) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim() === '') continue;
        return value;
    }
    return undefined;
};

const buildScoreFromParts = (home: any, away: any) => {
    if (home === undefined || home === null || away === undefined || away === null) {
        return undefined;
    }
    return `${home}-${away}`;
};

const normalizeStateValue = (value: any): number | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const isLiveState = (value: any): boolean => {
    const state = normalizeStateValue(value);
    if (state === undefined) {
        return false;
    }
    // 除 0（未开赛）和 -1（已结束）外，iSports 其它状态基本为进行中或暂停状态
    return state !== 0 && state !== -1;
};

const filterMatchesByShowtype = (matches: any[], showtype: string) => {
    if (!Array.isArray(matches)) {
        return [];
    }

    const parseMatchDate = (match: any): Date | null => {
        const raw = pickValue(
            match.match_time,
            match.time,
            match.timer,
            match.matchTime,
            match.datetime
        );

        if (!raw) {
            return null;
        }

        const date = new Date(raw);
        if (!Number.isFinite(date.getTime())) {
            return null;
        }
        return date;
    };

    const startOfDay = (offsetDays = 0) => {
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        base.setDate(base.getDate() + offsetDays);
        return base;
    };

    const todayStart = startOfDay(0);
    const tomorrowStart = startOfDay(1);
    const dayAfterTomorrowStart = startOfDay(2);

    const isFinished = (match: any) => normalizeStateValue(match.state ?? match.status) === -1;

    if (showtype === 'live') {
        return matches.filter((m) => isLiveState(m.state ?? m.status));
    }

    if (showtype === 'today') {
        return matches
            .filter((m) => !isFinished(m))
            .filter((m) => {
                const date = parseMatchDate(m);
                if (date) {
                    return date >= todayStart && date < tomorrowStart;
                }
                const state = normalizeStateValue(m.state ?? m.status);
                return state === 0 || isLiveState(state);
            });
    }

    if (showtype === 'early') {
        return matches
            .filter((m) => !isFinished(m))
            .filter((m) => {
                const date = parseMatchDate(m);
                if (date) {
                    return date >= tomorrowStart && date < dayAfterTomorrowStart;
                }
                const state = normalizeStateValue(m.state ?? m.status);
                return state === 0;
            });
    }

    return matches.filter((m) => !isFinished(m));
};

const normalizeMatchForFrontend = (match: any) => {
    if (!match) return match;
    const normalized = { ...match };

    const home = pickValue(match.home, match.team_h, match.teamH, match.homeName, match.home_team);
    if (home !== undefined) normalized.home = home;

    const away = pickValue(match.away, match.team_c, match.teamC, match.awayName, match.away_team);
    if (away !== undefined) normalized.away = away;

    const league = pickValue(match.league, match.league_name, match.leagueName);
    if (league !== undefined) normalized.league = league;

    const scoreFromParts = buildScoreFromParts(
        pickValue(match.score_h, match.homeScore, match.HomeScore, match.hscore, match.home_half_score),
        pickValue(match.score_c, match.awayScore, match.AwayScore, match.ascore, match.away_half_score)
    );
    const score = pickValue(match.score, match.current_score, scoreFromParts);
    if (score !== undefined) {
        normalized.score = score;
        normalized.current_score = score;
    }

    const matchTime = pickValue(match.time, match.match_time, match.timer);
    if (matchTime !== undefined) {
        if (!normalized.time) normalized.time = matchTime;
        if (!normalized.timer) normalized.timer = matchTime;
        if (!normalized.match_time) normalized.match_time = matchTime;
    }

    const period = pickValue(match.period, match.match_period);
    if (period !== undefined) normalized.period = period;

    const clock = pickValue(match.clock, match.match_clock);
    if (clock !== undefined) normalized.clock = clock;

    const stateRaw = pickValue(match.state, match.status);
    if (stateRaw !== undefined) {
        const parsedState = typeof stateRaw === 'string' ? parseInt(stateRaw, 10) : stateRaw;
        normalized.state = Number.isFinite(parsedState) ? parsedState : stateRaw;
    }

    return normalized;
};

// 辅助函数：自动获取并保存账号限额
async function autoFetchAndSaveLimits(accountId: number, account: any): Promise<void> {
    try {
        console.log(`🎯 开始自动获取账号 ${accountId} 的限额信息...`);

        const uid = getCrownAutomation().getApiUid(accountId);
        if (!uid) {
            console.warn('⚠️ 无法获取 UID，跳过限额获取');
            return;
        }

        const { CrownApiClient } = await import('../services/crown-api-client');
        const apiClient = new CrownApiClient({
            baseUrl: account.base_url || 'https://hga038.com',
            deviceType: account.device_type,
            userAgent: account.user_agent,
            proxy: account.proxy_enabled ? {
                enabled: true,
                type: account.proxy_type,
                host: account.proxy_host,
                port: account.proxy_port,
                username: account.proxy_username,
                password: account.proxy_password,
            } : { enabled: false },
        });

        // 恢复 Cookie 和 UID
        if (account.api_cookies) {
            apiClient.setCookies(account.api_cookies);
        }
        apiClient.setUid(uid);

        // 获取足球限额
        const ftSettings = await apiClient.getAccountSettings('FT');
        const footballLimits: any = {};

        if (typeof ftSettings === 'string' && ftSettings.includes('<FT>')) {
            const ftMatch = ftSettings.match(/<FT>(.*?)<\/FT>/s);
            if (ftMatch) {
                const ftContent = ftMatch[1];
                const extractLimits = (tag: string): { max: number | null; min: number | null } => {
                    const maxRegex = new RegExp(`<${tag}><max>([^<]+)<\\/max>`);
                    const minRegex = new RegExp(`<${tag}><min>([^<]+)<\\/min>`);
                    const maxMatch = ftContent.match(maxRegex);
                    const minMatch = ftContent.match(minRegex);
                    return {
                        max: maxMatch ? parseInt(maxMatch[1].replace(/,/g, ''), 10) : null,
                        min: minMatch ? parseInt(minMatch[1].replace(/,/g, ''), 10) : null,
                    };
                };

                // 提取所有限额类型
                footballLimits.R = extractLimits('R');     // 让球、大小、单双
                footballLimits.RE = extractLimits('RE');   // 滚球让球、滚球大小、滚球单双
                footballLimits.M = extractLimits('M');     // 独赢、滚球独赢
                footballLimits.DT = extractLimits('DT');   // 其他
                footballLimits.RDT = extractLimits('RDT'); // 滚球其他

                console.log('⚽ 足球限额:', footballLimits);
            }
        }

        // 获取篮球限额
        const bkSettings = await apiClient.getAccountSettings('BK');
        const basketballLimits: any = {};

        if (typeof bkSettings === 'string' && bkSettings.includes('<BK>')) {
            const bkMatch = bkSettings.match(/<BK>(.*?)<\/BK>/s);
            if (bkMatch) {
                const bkContent = bkMatch[1];
                const extractLimits = (tag: string): { max: number | null; min: number | null } => {
                    const maxRegex = new RegExp(`<${tag}><max>([^<]+)<\\/max>`);
                    const minRegex = new RegExp(`<${tag}><min>([^<]+)<\\/min>`);
                    const maxMatch = bkContent.match(maxRegex);
                    const minMatch = bkContent.match(minRegex);
                    return {
                        max: maxMatch ? parseInt(maxMatch[1].replace(/,/g, ''), 10) : null,
                        min: minMatch ? parseInt(minMatch[1].replace(/,/g, ''), 10) : null,
                    };
                };

                // 提取所有限额类型
                basketballLimits.DT = extractLimits('DT');  // 其他
                basketballLimits.M = extractLimits('M');    // 独赢、滚球独赢
                basketballLimits.R = extractLimits('R');    // 让球、大小、单双
                basketballLimits.RE = extractLimits('RE');  // 滚球让球、滚球大小、滚球单双

                console.log('🏀 篮球限额:', basketballLimits);
            }
        }

        // 构建完整的限额数据
        const limitsData = {
            football: footballLimits,
            basketball: basketballLimits,
            updated_at: new Date().toISOString(),
        };

        // 更新数据库中的限额信息
        await query(
            `UPDATE crown_accounts
             SET football_prematch_limit = $1,
                 football_live_limit = $2,
                 basketball_prematch_limit = $3,
                 basketball_live_limit = $4,
                 limits_data = $5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [
                footballLimits.R?.max || 0,
                footballLimits.RE?.max || 0,
                basketballLimits.R?.max || 0,
                basketballLimits.RE?.max || 0,
                JSON.stringify(limitsData),
                accountId
            ]
        );

        console.log(`✅ 自动获取限额成功:`, limitsData);
    } catch (error) {
        console.error('❌ 自动获取限额失败:', error);
        // 不影响登录结果，只记录错误
    }
}

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

        let account = accountResult.rows[0];

        // 检查账号是否已经在线
        if (getCrownAutomation().isAccountOnline(accountId)) {
            return res.json({
                success: true,
                message: '账号已在线',
                data: { accountId, status: 'online' }
            } as ApiResponse);
        }

        // 🔥 新增：检查是否需要初始化
        const needsInitialization =
            (account.init_type === 'password_only' || account.init_type === 'full') &&
            !account.initialized_username;

        if (needsInitialization) {
            console.log(`🔄 账号需要初始化 (init_type=${account.init_type})，先执行初始化...`);

            // 生成新的账号和密码
            const generateUsername = () => {
                const prefix = 'hg';
                const randomNum = Math.floor(Math.random() * 900000) + 100000;
                return `${prefix}${randomNum}`;
            };

            const generatePassword = () => {
                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let password = '';
                for (let i = 0; i < 8; i++) {
                    password += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return password;
            };

            const newUsername = account.init_type === 'full' ? generateUsername() : account.username;
            const newPassword = generatePassword();

            console.log(`📝 生成新凭证: username=${newUsername}, password=${newPassword}`);

            // 执行初始化
            const automation = getCrownAutomation();
            const initResult = await automation.initializeAccountWithApi(account, {
                username: newUsername,
                password: newPassword,
            });

            if (!initResult.success) {
                console.error('❌ 初始化失败:', initResult.message);
                return res.status(400).json({
                    success: false,
                    error: `初始化失败: ${initResult.message}`
                });
            }

            console.log(`✅ 初始化成功: ${initResult.updatedCredentials.username}`);

            // 更新数据库
            const originalUsername = account.original_username || account.username;
            await query(
                `UPDATE crown_accounts
                 SET username = $1,
                     password = $2,
                     original_username = COALESCE(original_username, $4),
                     initialized_username = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [initResult.updatedCredentials.username, initResult.updatedCredentials.password, accountId, originalUsername]
            );

            // 重新查询账号信息
            const updatedAccountResult = await query(
                `SELECT ca.* FROM crown_accounts ca WHERE ca.id = $1`,
                [accountId]
            );
            account = updatedAccountResult.rows[0];
        }

        // 执行登录（使用纯 API 方式）
        const loginResult = await getCrownAutomation().loginAccountWithApi(account);

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

            // 登录成功后，自动获取并保存限额信息
            await autoFetchAndSaveLimits(accountId, account);
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
                status: loginResult.success ? 'online' : 'offline'
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

// 使用纯 API 方式登录皇冠账号（推荐）
router.post('/login-api/:accountId', async (req: any, res) => {
    console.log('🎯 收到纯 API 登录请求，账号ID:', req.params.accountId);
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

        // 使用纯 API 方式登录
        const automation = getCrownAutomation();
        const loginResult = await automation.loginAccountWithApi(account);

        if (!loginResult.success) {
            console.warn('API 登录账号失败:', loginResult.message, loginResult);

            // 更新数据库状态
            await query(
                `UPDATE crown_accounts
                 SET is_online = false,
                     status = 'error',
                     error_message = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [accountId, (loginResult.message || '登录失败').slice(0, 255)]
            );

            return res.status(400).json({
                success: false,
                error: loginResult.message || '登录失败'
            });
        }

        // 更新数据库状态
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

        // 登录成功后，自动获取并保存限额信息
        await autoFetchAndSaveLimits(accountId, account);

        res.json({
            success: true,
            message: loginResult.message || '登录成功',
            data: {
                accountId,
                status: 'online'
            }
        } as ApiResponse);

    } catch (error) {
        console.error('API 登录账号失败:', error);
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

// 使用纯 API 方式初始化账号（推荐）
router.post('/initialize-api/:accountId', async (req: any, res) => {
    console.log('🎯 收到纯 API 初始化请求，账号ID:', req.params.accountId);
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
            console.warn(`[INIT-API] 账号不存在或无权限`, { userId, accountId });
            return res.status(404).json({
                success: false,
                error: '账号不存在或无权限'
            });
        }

        const account = accountResult.rows[0];

        const automation = getCrownAutomation();
        const initResult = await automation.initializeAccountWithApi(account, {
            username: newUsername.trim(),
            password: newPassword.trim(),
        });

        if (!initResult.success) {
            console.warn('API 初始化账号失败:', initResult.message, initResult);
            return res.status(400).json({
                success: false,
                error: initResult.message || '初始化失败'
            });
        }

        const finalUsername = initResult.updatedCredentials.username.trim();
        const finalPassword = initResult.updatedCredentials.password.trim();

        res.json({
            success: true,
            message: initResult.message || '账号初始化成功',
            data: {
                username: finalUsername,
                password: finalPassword,
            },
        } as ApiResponse);

    } catch (error) {
        console.error('API 初始化账号失败:', error);
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
        if (!getCrownAutomation().isAccountOnline(accountId)) {
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

        // 执行下注
        const betResult = await getCrownAutomation().placeBet(accountId, {
            betType,
            betOption,
            amount: crownAmount,
            odds,
            platformAmount,
            discount,
            match_id: matchDbId !== undefined ? Number(matchDbId) : undefined,
            crown_match_id: crownMatch,
            home_team: homeTeamName,
            away_team: awayTeamName,
        });

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
                actualOdds: betResult.actualOdds,
                platformAmount,
                crownAmount,
                discount,
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

        // 更新余额和信用额度到数据库
        if (financial.balance !== null || financial.credit !== null) {
            await query(
                `UPDATE crown_accounts
                 SET balance = $1, credit = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [financial.balance ?? 0, financial.credit ?? 0, accountId]
            );
        }

        const success = financial.credit !== null;

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

        // 逐个登录账号（避免并发过多导致检测）（使用纯 API 方式）
        for (const account of accountsResult.rows) {
            try {
                const loginResult = await getCrownAutomation().loginAccountWithApi(account);
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

        // 优先读取独立抓取服务的数据文件
        try {
            const fs = require('fs');
            const path = require('path');
            const candidates = [
                { file: path.join(__dirname, '../../..', 'fetcher-isports', 'data', 'latest-matches.json'), source: 'independent-fetcher' },
                { file: path.join(__dirname, '../../..', 'fetcher', 'data', 'latest-matches.json'), source: 'legacy-fetcher' },
            ];

            for (const candidate of candidates) {
                if (!fs.existsSync(candidate.file)) {
                    continue;
                }

                try {
                    const fileContent = fs.readFileSync(candidate.file, 'utf-8');
                    const fetcherData = JSON.parse(fileContent);
                    const matchCount = fetcherData.matchCount ?? (fetcherData.matches?.length || 0);
                    const timestamp = fetcherData.timestamp || 0;
                    const age = Date.now() - timestamp;

                    if (age < 10000) {
                        console.log(`✅ 使用独立抓取服务数据 (${matchCount} 场比赛, ${Math.max(0, Math.floor(age / 1000))}秒前)`);
                        const normalizedMatches = (fetcherData.matches || []).map((m: any) => normalizeMatchForFrontend(m));
                        const filteredMatches = filterMatchesByShowtype(normalizedMatches, String(showtype));

                        res.json({
                            success: true,
                            data: {
                                matches: filteredMatches,
                                meta: { gtype, showtype, rtype, ltype, sorttype },
                                source: candidate.source,
                                lastUpdate: timestamp,
                            }
                        });
                        return;
                    }

                    console.log(`⚠️ 独立抓取服务数据过期 (${Math.max(0, Math.floor(age / 1000))}秒前)，尝试下一数据源`);
                } catch (error) {
                    console.error(`❌ 读取独立抓取服务数据失败 (${candidate.file}):`, error);
                }
            }

            console.log('⚠️ 独立抓取服务数据不可用，使用降级方案');
        } catch (error) {
            console.error('❌ 读取独立抓取服务数据失败:', error);
        }

        // 尝试使用内置的独立抓取服务
        const fetcher = getMatchFetcher();
        if (fetcher) {
            const data = fetcher.getLatestMatches();
            const filteredMatches = filterMatchesByShowtype(data.matches ?? [], String(showtype));
            res.json({
                success: true,
                data: {
                    matches: filteredMatches,
                    meta: { gtype, showtype, rtype, ltype, sorttype },
                    raw: data.xml,
                    source: 'dedicated-fetcher',
                    lastUpdate: data.lastUpdate,
                }
            });
            return;
        }

        // 降级：使用原有的抓取方式
        const { matches, xml } = await getCrownAutomation().fetchMatchesSystem({
            gtype: String(gtype),
            showtype: String(showtype),
            rtype: String(rtype || (String(showtype) === 'live' ? 'rb' : 'r')),
            ltype: String(ltype),
            sorttype: String(sorttype),
        });

        const normalizedMatches = (matches || []).map((m: any) => normalizeMatchForFrontend(m));
        const filteredMatches = filterMatchesByShowtype(normalizedMatches, String(showtype));

        res.json({
            success: true,
            data: {
                matches: filteredMatches,
                meta: { gtype, showtype, rtype, ltype, sorttype },
                raw: xml,
                source: 'fallback',
            }
        });
    } catch (error) {
        console.error('系统抓取赛事接口错误:', error);
        res.status(500).json({ success: false, error: '抓取赛事失败' });
    }
});

// 获取最新赔率预览
router.post('/odds/preview', async (req: any, res) => {
    try {
        const body = req.body || {};
        const accountId = parseInt(body.account_id ?? body.accountId, 10);

        if (!Number.isFinite(accountId)) {
            return res.status(400).json({ success: false, error: '请选择账号' });
        }

        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.id FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: '账号不存在或无权限' });
        }

        const betType = body.bet_type || body.betType || '让球';
        const betOption = body.bet_option || body.betOption || '';
        const marketLine = body.market_line ?? body.marketLine;
        const marketIndexRaw = body.market_index ?? body.marketIndex;
        const marketIndex =
            marketIndexRaw === undefined || marketIndexRaw === null
                ? undefined
                : Number.isFinite(Number(marketIndexRaw))
                    ? Number(marketIndexRaw)
                    : undefined;

        const payload = {
            betType,
            betOption,
            amount: Number(body.bet_amount ?? 0),
            odds: Number(body.odds ?? 0),
            match_id: body.match_id,
            matchId: body.match_id,
            crown_match_id: body.crown_match_id || body.crownMatchId,
            crownMatchId: body.crown_match_id || body.crownMatchId,
            league_name: body.league_name || body.leagueName,
            leagueName: body.league_name || body.leagueName,
            home_team: body.home_team || body.homeTeam,
            homeTeam: body.home_team || body.homeTeam,
            away_team: body.away_team || body.awayTeam,
            awayTeam: body.away_team || body.awayTeam,
            market_category: body.market_category || body.marketCategory,
            marketCategory: body.market_category || body.marketCategory,
            market_scope: body.market_scope || body.marketScope,
            marketScope: body.market_scope || body.marketScope,
            market_side: body.market_side || body.marketSide,
            marketSide: body.market_side || body.marketSide,
            market_line: typeof marketLine === 'string' ? marketLine : undefined,
            marketLine: typeof marketLine === 'string' ? marketLine : undefined,
            market_index: marketIndex,
            marketIndex: marketIndex,
            market_wtype: body.market_wtype || body.marketWtype,
            marketWtype: body.market_wtype || body.marketWtype,
            market_rtype: body.market_rtype || body.marketRtype,
            marketRtype: body.market_rtype || body.marketRtype,
            market_chose_team: body.market_chose_team || body.marketChoseTeam,
            marketChoseTeam: body.market_chose_team || body.marketChoseTeam,
        };

        const preview = await getCrownAutomation().fetchLatestOdds(accountId, payload as any);
        if (!preview.success) {
            res.json({
                success: false,
                error: preview.message,
                data: {
                    closed: preview.closed ?? preview.reasonCode === '555',
                    reasonCode: preview.reasonCode,
                    crown_match_id: preview.crownMatchId,
                },
            });
            return;
        }

        const oddsValueRaw = preview.oddsResult?.ioratio ?? preview.oddsResult?.ioratio_now ?? null;
        const oddsNumeric = oddsValueRaw !== null && oddsValueRaw !== undefined
            ? parseFloat(String(oddsValueRaw))
            : null;

        res.json({
            success: true,
            data: {
                odds: Number.isFinite(oddsNumeric) ? oddsNumeric : null,
                closed: false,
                market: preview.variant,
                raw: preview.oddsResult,
                crown_match_id: preview.crownMatchId,
                message: preview.message,
            },
        });
    } catch (error) {
        console.error('获取最新赔率失败:', error);
        res.status(500).json({ success: false, error: '获取最新赔率失败' });
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
  const interval = params.showtype === 'live' ? 1000 : 15000;

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

// SSE 入口：/api/crown-automation/matches/stream?accountId=1&gtype=ft&showtype=live&rtype=rb&ltype=3&sorttype=L
router.get('/matches/stream', async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const accountId = parseInt(String(req.query.accountId || ''));
    const gtype = String(req.query.gtype || 'ft');
    const showtype = String(req.query.showtype || 'live');
    const rtype = String(req.query.rtype || (showtype === 'live' ? 'rb' : 'r'));
    const ltype = String(req.query.ltype || '3');
    const sorttype = String(req.query.sorttype || 'L');

    // 验证账号归属
        const access = buildAccountAccess(req.user, { includeDisabled: true });
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
    const userId = req.user.id;
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

    // 自定义轮询：优先使用独立抓取服务的数据文件
    const interval = showtype === 'live' ? 1000 : 15000;
    let tm: NodeJS.Timeout | undefined;
    const tick = async () => {
      try {
        let matches: any[] = [];
        let xml: string | undefined;

        // 优先读取独立抓取服务的数据文件
        try {
          const fs = require('fs');
          const path = require('path');
          const candidates = [
            { file: path.join(__dirname, '../../..', 'fetcher-isports', 'data', 'latest-matches.json') },
            { file: path.join(__dirname, '../../..', 'fetcher', 'data', 'latest-matches.json') },
          ];

          for (const candidate of candidates) {
            if (!fs.existsSync(candidate.file)) {
              continue;
            }

            try {
              const fetcherData = JSON.parse(fs.readFileSync(candidate.file, 'utf-8'));
              const timestamp = fetcherData.timestamp || 0;
              const age = Date.now() - timestamp;
              if (age < 10000) {
                matches = (fetcherData.matches || []).map((m: any) => normalizeMatchForFrontend(m));
                xml = fetcherData.xml;
                break;
              }
            } catch (readErr) {
              console.error(`读取独立抓取服务数据失败 (${candidate.file}):`, readErr);
            }
          }
        } catch (err) {
          console.error('读取独立抓取服务数据失败:', err);
        }

        // 如果没有数据，使用降级方案
        if (matches.length === 0) {
          const result = await getCrownAutomation().fetchMatchesSystem({ gtype, showtype, rtype, ltype, sorttype });
          matches = (result.matches || []).map((m: any) => normalizeMatchForFrontend(m));
          xml = result.xml;
        }

        matches = filterMatchesByShowtype(matches, showtype);

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

// 获取账号额度设置
router.get('/account-settings/:accountId', async (req: any, res) => {
    try {
        const accountId = parseInt(req.params.accountId);
        const { gtype = 'FT' } = req.query;

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.* FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        const account = accountResult.rows[0];

        // 检查账号是否在线
        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({
                success: false,
                error: '账号未登录，无法获取额度设置'
            });
        }

        // 获取 UID
        const uid = getCrownAutomation().getApiUid(accountId);
        if (!uid) {
            return res.status(400).json({
                success: false,
                error: '账号未登录或 UID 不存在'
            });
        }

        // 创建 API 客户端
        const { CrownApiClient } = await import('../services/crown-api-client');
        const apiClient = new CrownApiClient({
            baseUrl: account.base_url || 'https://hga038.com',
            deviceType: account.device_type,
            userAgent: account.user_agent,
            proxy: account.proxy_enabled ? {
                enabled: true,
                type: account.proxy_type,
                host: account.proxy_host,
                port: account.proxy_port,
                username: account.proxy_username,
                password: account.proxy_password,
            } : { enabled: false },
        });

        // 恢复 Cookie 和 UID
        if (account.api_cookies) {
            apiClient.setCookies(account.api_cookies);
        }
        apiClient.setUid(uid);

        // 获取账号设置
        const settings = await apiClient.getAccountSettings(gtype as string);

        res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        console.error('获取账号额度设置错误:', error);
        res.status(500).json({
            success: false,
            error: '获取额度设置失败'
        });
    }
});

// 获取账号下注历史
router.get('/history/:accountId', async (req: any, res) => {
    try {
        const accountId = parseInt(req.params.accountId);
        const { gtype, isAll, startdate, enddate, filter } = req.query;

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.* FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        const account = accountResult.rows[0];

        // 检查账号是否在线
        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({
                success: false,
                error: '账号未登录，无法获取历史记录'
            });
        }

        // 获取 UID
        const uid = getCrownAutomation().getApiUid(accountId);
        if (!uid) {
            return res.status(400).json({
                success: false,
                error: '账号未登录或 UID 不存在'
            });
        }

        // 创建 API 客户端
        const { CrownApiClient } = await import('../services/crown-api-client');
        const apiClient = new CrownApiClient({
            baseUrl: account.base_url || 'https://hga038.com',
            deviceType: account.device_type,
            userAgent: account.user_agent,
            proxy: account.proxy_enabled ? {
                enabled: true,
                type: account.proxy_type,
                host: account.proxy_host,
                port: account.proxy_port,
                username: account.proxy_username,
                password: account.proxy_password,
            } : { enabled: false },
        });

        // 恢复 Cookie 和 UID
        if (account.api_cookies) {
            apiClient.setCookies(account.api_cookies);
        }
        apiClient.setUid(uid);

        // 获取历史记录
        const history = await apiClient.getHistoryData({
            gtype: gtype as string,
            isAll: isAll as string,
            startdate: startdate as string,
            enddate: enddate as string,
            filter: filter as string,
        });

        res.json({
            success: true,
            data: history
        });

    } catch (error) {
        console.error('获取账号历史记录错误:', error);
        res.status(500).json({
            success: false,
            error: '获取历史记录失败'
        });
    }
});

// 获取账号今日下注
router.get('/today-wagers/:accountId', async (req: any, res) => {
    try {
        const accountId = parseInt(req.params.accountId);
        const { gtype, chk_cw } = req.query;

        // 验证账号是否属于当前用户
        const access = buildAccountAccess(req.user, { includeDisabled: true });
        const accountResult = await query(
            `SELECT ca.* FROM crown_accounts ca WHERE ca.id = $1${access.clause}`,
            [accountId, ...access.params]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        const account = accountResult.rows[0];

        // 检查账号是否在线
        if (!getCrownAutomation().isAccountOnline(accountId)) {
            return res.status(400).json({
                success: false,
                error: '账号未登录，无法获取今日下注'
            });
        }

        // 获取 UID
        const uid = getCrownAutomation().getApiUid(accountId);
        if (!uid) {
            return res.status(400).json({
                success: false,
                error: '账号未登录或 UID 不存在'
            });
        }

        // 创建 API 客户端
        const { CrownApiClient } = await import('../services/crown-api-client');
        const apiClient = new CrownApiClient({
            baseUrl: account.base_url || 'https://hga038.com',
            deviceType: account.device_type,
            userAgent: account.user_agent,
            proxy: account.proxy_enabled ? {
                enabled: true,
                type: account.proxy_type,
                host: account.proxy_host,
                port: account.proxy_port,
                username: account.proxy_username,
                password: account.proxy_password,
            } : { enabled: false },
        });

        // 恢复 Cookie 和 UID
        if (account.api_cookies) {
            apiClient.setCookies(account.api_cookies);
        }
        apiClient.setUid(uid);

        // 获取今日下注
        const wagers = await apiClient.getTodayWagers({
            gtype: gtype as string,
            chk_cw: chk_cw as string,
        });

        res.json({
            success: true,
            data: wagers
        });

    } catch (error) {
        console.error('获取今日下注错误:', error);
        res.status(500).json({
            success: false,
            error: '获取今日下注失败'
        });
    }
});

// 获取账号限额信息
router.post('/fetch-limits/:accountId', async (req: any, res) => {
    try {
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

        // 获取限额信息
        const limitsResult = await getCrownAutomation().fetchAccountLimits(account);

        if (limitsResult.success) {
            // 更新数据库中的限额信息
            await query(
                `UPDATE crown_accounts
                 SET football_prematch_limit = $1,
                     football_live_limit = $2,
                     basketball_prematch_limit = $3,
                     basketball_live_limit = $4,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $5`,
                [
                    limitsResult.limits?.football.prematch || 0,
                    limitsResult.limits?.football.live || 0,
                    limitsResult.limits?.basketball.prematch || 0,
                    limitsResult.limits?.basketball.live || 0,
                    accountId
                ]
            );

            res.json({
                success: true,
                message: '限额信息获取成功',
                data: limitsResult.limits
            } as ApiResponse);
        } else {
            res.status(400).json({
                success: false,
                error: limitsResult.message || '获取限额信息失败'
            });
        }

    } catch (error) {
        console.error('获取账号限额错误:', error);
        res.status(500).json({
            success: false,
            error: '获取限额信息失败'
        });
    }
});

export default router;
