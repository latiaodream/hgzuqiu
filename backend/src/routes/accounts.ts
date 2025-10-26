import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../models/database';
import {
    CrownAccountCreateRequest,
    ApiResponse,
    CrownAccount,
    AccountSelectionResponse,
} from '../types';
import { selectAccounts } from '../services/account-selection';

const router = Router();
router.use(authenticateToken);

const parseOptionalNumber = (value: unknown): number | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }

    const str = Array.isArray(value) ? value[0] : value;
    const num = Number(str);
    return Number.isFinite(num) ? num : undefined;
};

// 账号优选（筛选可用账号）
router.get('/auto-select', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const matchId = parseOptionalNumber(req.query.match_id);
        const limit = parseOptionalNumber(req.query.limit);

        if (req.query.match_id !== undefined && matchId === undefined) {
            return res.status(400).json({
                success: false,
                error: 'match_id 参数无效，应为数字'
            });
        }

        if (req.query.limit !== undefined && (limit === undefined || limit <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'limit 参数无效，应为大于 0 的数字'
            });
        }

        const selection = await selectAccounts({
            userId,
            matchId,
            limit,
        });

        res.json({
            success: true,
            data: selection,
        } as ApiResponse<AccountSelectionResponse>);

    } catch (error) {
        console.error('账号优选失败:', error);
        res.status(500).json({
            success: false,
            error: '账号优选失败'
        });
    }
});

// 获取账号列表
router.get('/', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { group_id } = req.query;

        let sql: string;
        let params: any[];

        if (userRole === 'admin') {
            // 管理员可以查看所有账号
            sql = `
                SELECT ca.*, g.name as group_name, u.username as owner_username,
                       NULL::integer as shared_from_user_id,
                       NULL::varchar as shared_from_username
                FROM crown_accounts ca
                JOIN groups g ON ca.group_id = g.id
                JOIN users u ON ca.user_id = u.id
                WHERE 1=1
            `;
            params = [];
        } else if (userRole === 'agent') {
            // 代理可以查看下属员工的所有账号
            sql = `
                SELECT ca.*, g.name as group_name, u.username as owner_username,
                       NULL::integer as shared_from_user_id,
                       NULL::varchar as shared_from_username
                FROM crown_accounts ca
                JOIN groups g ON ca.group_id = g.id
                JOIN users u ON ca.user_id = u.id
                WHERE ca.agent_id = $1
            `;
            params = [userId];
        } else {
            // 员工可以查看自己的账号 + 别人分享给自己的账号
            sql = `
                SELECT ca.*, g.name as group_name,
                       NULL::integer as shared_from_user_id,
                       NULL::varchar as shared_from_username
                FROM crown_accounts ca
                JOIN groups g ON ca.group_id = g.id
                WHERE ca.user_id = $1

                UNION ALL

                SELECT ca.*, g.name as group_name,
                       s.owner_user_id as shared_from_user_id,
                       u.username as shared_from_username
                FROM crown_accounts ca
                JOIN groups g ON ca.group_id = g.id
                JOIN account_shares s ON ca.id = s.account_id
                JOIN users u ON s.owner_user_id = u.id
                WHERE s.shared_to_user_id = $1
            `;
            params = [userId];
        }

        if (group_id) {
            // 注意：UNION 查询需要在外层包装才能添加 WHERE 条件
            sql = `SELECT * FROM (${sql}) AS accounts WHERE group_id = $${params.length + 1}`;
            params.push(group_id);
        }

        sql += ' ORDER BY created_at DESC';

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows
        } as ApiResponse<CrownAccount[]>);

    } catch (error) {
        console.error('获取账号列表错误:', error);
        res.status(500).json({
            success: false,
            error: '获取账号列表失败'
        });
    }
});

// 创建新账号
router.post('/', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const agentId = req.user.agent_id;
        const accountData: CrownAccountCreateRequest = req.body;

        // 只有员工可以创建皇冠账号
        if (userRole !== 'staff') {
            return res.status(403).json({
                success: false,
                error: '只有员工可以创建皇冠账号'
            });
        }

        if (!accountData.username || !accountData.password || !accountData.group_id) {
            return res.status(400).json({
                success: false,
                error: '用户名、密码和分组不能为空'
            });
        }

        // 验证分组是否属于当前用户
        const groupCheck = await query(
            'SELECT id FROM groups WHERE id = $1 AND user_id = $2',
            [accountData.group_id, userId]
        );

        if (groupCheck.rows.length === 0) {
            return res.status(400).json({
                success: false,
                error: '分组不存在或无权限'
            });
        }

        const discountRaw = accountData.discount ?? 1.0;
        const discount = Number(discountRaw);
        if (!Number.isFinite(discount) || discount <= 0 || discount > 1) {
            return res.status(400).json({
                success: false,
                error: '折扣需大于 0 且小于等于 1',
            });
        }

        let normalizedProxyType = accountData.proxy_type?.toUpperCase() || null;
        let proxyHost = accountData.proxy_host?.trim() || null;
        const proxyPort = accountData.proxy_port ?? null;

        if (accountData.proxy_enabled) {
            if (!normalizedProxyType || !['HTTP', 'HTTPS', 'SOCKS5'].includes(normalizedProxyType)) {
                return res.status(400).json({
                    success: false,
                    error: '代理类型无效，仅支持 HTTP/HTTPS/SOCKS5',
                });
            }

            if (!proxyHost) {
                return res.status(400).json({
                    success: false,
                    error: '启用代理时必须填写代理地址',
                });
            }

            if (!proxyPort || proxyPort <= 0 || proxyPort > 65535) {
                return res.status(400).json({
                    success: false,
                    error: '启用代理时必须填写合法的代理端口',
                });
            }
        } else {
            normalizedProxyType = null;
            proxyHost = null;
        }

        const stopProfitRaw = accountData.stop_profit_limit ?? 0;
        const stopProfitLimit = Number(stopProfitRaw);
        if (!Number.isFinite(stopProfitLimit) || stopProfitLimit < 0) {
            return res.status(400).json({
                success: false,
                error: '止盈金额必须是大于等于 0 的数字',
            });
        }

        const proxyUsername = accountData.proxy_enabled ? accountData.proxy_username || null : null;
        const proxyPassword = accountData.proxy_enabled ? accountData.proxy_password || null : null;

        const result = await query(`
            INSERT INTO crown_accounts (
                user_id, group_id, agent_id, username, password, passcode, display_name,
                game_type, source, currency, discount, note, device_type, stop_profit_limit,
                proxy_enabled, proxy_type, proxy_host, proxy_port, proxy_username, proxy_password,
                football_prematch_limit, football_live_limit, basketball_prematch_limit, basketball_live_limit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
            RETURNING *
        `, [
            userId,
            accountData.group_id,
            agentId, // 设置 agent_id
            accountData.username,
            accountData.password,
            accountData.passcode || null,
            accountData.display_name || `${accountData.username} (${accountData.username.slice(0, 6)})`,
            accountData.game_type || '足球',
            accountData.source || '自有',
            accountData.currency || 'CNY',
            discount,
            accountData.note || '高',
            accountData.device_type || 'iPhone 14',
            stopProfitLimit,
            accountData.proxy_enabled || false,
            normalizedProxyType,
            proxyHost,
            proxyPort,
            proxyUsername,
            proxyPassword,
            accountData.football_prematch_limit || 100000,
            accountData.football_live_limit || 100000,
            accountData.basketball_prematch_limit || 100000,
            accountData.basketball_live_limit || 100000
        ]);

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: '账号创建成功'
        } as ApiResponse<CrownAccount>);

    } catch (error) {
        console.error('创建账号错误:', error);
        res.status(500).json({
            success: false,
            error: '创建账号失败'
        });
    }
});

// 更新账号
router.put('/:id', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.id);
        const updateData = req.body;

        // 检查账号是否属于当前用户
        const accountCheck = await query(
            'SELECT id FROM crown_accounts WHERE id = $1 AND user_id = $2',
            [accountId, userId]
        );

        if (accountCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        if (updateData.discount !== undefined && updateData.discount !== null) {
            const numericDiscount = Number(updateData.discount);
            if (!Number.isFinite(numericDiscount) || numericDiscount <= 0 || numericDiscount > 1) {
                return res.status(400).json({
                    success: false,
                    error: '折扣需大于 0 且小于等于 1',
                });
            }
            updateData.discount = numericDiscount;
        }

        if (updateData.stop_profit_limit !== undefined && updateData.stop_profit_limit !== null) {
            const stopProfitValue = Number(updateData.stop_profit_limit);
            if (!Number.isFinite(stopProfitValue) || stopProfitValue < 0) {
                return res.status(400).json({
                    success: false,
                    error: '止盈金额必须是大于等于 0 的数字',
                });
            }
            updateData.stop_profit_limit = stopProfitValue;
        }

        if (updateData.proxy_enabled === true) {
            const proxyType = updateData.proxy_type?.toUpperCase();
            if (!proxyType || !['HTTP', 'HTTPS', 'SOCKS5'].includes(proxyType)) {
                return res.status(400).json({
                    success: false,
                    error: '代理类型无效，仅支持 HTTP/HTTPS/SOCKS5',
                });
            }
            if (!updateData.proxy_host?.trim()) {
                return res.status(400).json({
                    success: false,
                    error: '启用代理时必须填写代理地址',
                });
            }
            if (!updateData.proxy_port || updateData.proxy_port <= 0 || updateData.proxy_port > 65535) {
                return res.status(400).json({
                    success: false,
                    error: '启用代理时必须填写合法的代理端口',
                });
            }
            updateData.proxy_type = proxyType;
            updateData.proxy_host = updateData.proxy_host.trim();
        } else if (updateData.proxy_enabled === false) {
            updateData.proxy_type = null;
            updateData.proxy_host = null;
            updateData.proxy_port = null;
            updateData.proxy_username = null;
            updateData.proxy_password = null;
        }

        const result = await query(`
            UPDATE crown_accounts SET
                username = COALESCE($1, username),
                password = COALESCE($2, password),
                passcode = COALESCE($3, passcode),
                display_name = COALESCE($4, display_name),
                game_type = COALESCE($5, game_type),
                source = COALESCE($6, source),
                currency = COALESCE($7, currency),
                discount = COALESCE($8, discount),
                note = COALESCE($9, note),
                stop_profit_limit = COALESCE($10, stop_profit_limit),
                device_type = COALESCE($11, device_type),
                proxy_enabled = COALESCE($12, proxy_enabled),
                proxy_type = COALESCE($13, proxy_type),
                proxy_host = COALESCE($14, proxy_host),
                proxy_port = COALESCE($15, proxy_port),
                proxy_username = COALESCE($16, proxy_username),
                proxy_password = COALESCE($17, proxy_password),
                is_enabled = COALESCE($18, is_enabled),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $19 AND user_id = $20
            RETURNING *
        `, [
            updateData.username,
            updateData.password,
            updateData.passcode,
            updateData.display_name,
            updateData.game_type,
            updateData.source,
            updateData.currency,
            updateData.discount,
            updateData.note,
            updateData.stop_profit_limit,
            updateData.device_type,
            updateData.proxy_enabled,
            updateData.proxy_type,
            updateData.proxy_host,
            updateData.proxy_port,
            updateData.proxy_username,
            updateData.proxy_password,
            updateData.is_enabled,
            accountId,
            userId
        ]);

        res.json({
            success: true,
            data: result.rows[0],
            message: '账号更新成功'
        } as ApiResponse<CrownAccount>);

    } catch (error) {
        console.error('更新账号错误:', error);
        res.status(500).json({
            success: false,
            error: '更新账号失败'
        });
    }
});

// 删除账号
router.delete('/:id', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const accountId = parseInt(req.params.id);

        // 检查账号是否属于当前用户
        const accountCheck = await query(
            'SELECT id FROM crown_accounts WHERE id = $1 AND user_id = $2',
            [accountId, userId]
        );

        if (accountCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '账号不存在'
            });
        }

        await query(
            'DELETE FROM crown_accounts WHERE id = $1 AND user_id = $2',
            [accountId, userId]
        );

        res.json({
            success: true,
            message: '账号删除成功'
        } as ApiResponse);

    } catch (error) {
        console.error('删除账号错误:', error);
        res.status(500).json({
            success: false,
            error: '删除账号失败'
        });
    }
});

// 批量更新账号状态
router.post('/batch-update-status', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const { account_ids, is_enabled } = req.body;

        if (!Array.isArray(account_ids) || account_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请选择要更新的账号'
            });
        }

        const placeholders = account_ids.map((_, index) => `$${index + 3}`).join(',');
        
        await query(
            `UPDATE crown_accounts SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE user_id = $2 AND id IN (${placeholders})`,
            [is_enabled, userId, ...account_ids]
        );

        res.json({
            success: true,
            message: `批量更新${account_ids.length}个账号状态成功`
        } as ApiResponse);

    } catch (error) {
        console.error('批量更新账号状态错误:', error);
        res.status(500).json({
            success: false,
            error: '批量更新账号状态失败'
        });
    }
});

export { router as accountRoutes };
