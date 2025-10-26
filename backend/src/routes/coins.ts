import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../models/database';
import { ApiResponse, CoinTransaction } from '../types';

const router = Router();
router.use(authenticateToken);

// 辅助函数：获取用户当前金币余额
async function getUserBalance(userId: number): Promise<number> {
    const result = await query(
        'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
        [userId]
    );
    return parseFloat(result.rows[0].balance);
}

// 辅助函数：生成交易ID
function generateTransactionId(prefix: string): string {
    return `${prefix}${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
}

// 获取金币流水记录
router.get('/', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { type, start_date, end_date, limit = 50, offset = 0 } = req.query;

        let sql = `
            SELECT ct.*, ca.username as account_username, ca.display_name as account_display_name,
                   u.username as user_username, u.role as user_role
            FROM coin_transactions ct
            LEFT JOIN crown_accounts ca ON ct.account_id = ca.id
            LEFT JOIN users u ON ct.user_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        // 权限控制：代理可以查看自己和下属员工的数据
        if (userRole === 'admin') {
            // 管理员可以查看所有数据（不添加额外条件）
        } else if (userRole === 'agent') {
            // 代理可以查看自己和下属员工的数据
            sql += ` AND (ct.user_id = $${paramIndex++} OR ct.user_id IN (SELECT id FROM users WHERE agent_id = $${paramIndex++}))`;
            params.push(userId, userId);
        } else {
            // 普通员工只能查看自己的数据
            sql += ` AND ct.user_id = $${paramIndex++}`;
            params.push(userId);
        }

        if (type) {
            sql += ` AND ct.transaction_type = $${paramIndex++}`;
            params.push(type);
        }

        if (start_date) {
            sql += ` AND DATE(ct.created_at) >= $${paramIndex++}`;
            params.push(start_date);
        }

        if (end_date) {
            sql += ` AND DATE(ct.created_at) <= $${paramIndex++}`;
            params.push(end_date);
        }

        sql += ` ORDER BY ct.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(sql, params);

        // 构建统计查询的 WHERE 条件（与主查询保持一致）
        let statsWhere = '';
        const statsParams: any[] = [];
        let statsParamIndex = 1;

        if (userRole === 'admin') {
            // 管理员查看所有数据
            statsWhere = 'WHERE 1=1';
        } else if (userRole === 'agent') {
            // 代理查看自己和下属员工的数据
            statsWhere = `WHERE (user_id = $${statsParamIndex++} OR user_id IN (SELECT id FROM users WHERE agent_id = $${statsParamIndex++}))`;
            statsParams.push(userId, userId);
        } else {
            // 普通员工只看自己的数据
            statsWhere = `WHERE user_id = $${statsParamIndex++}`;
            statsParams.push(userId);
        }

        // 获取当前余额（根据权限）
        const balanceResult = await query(
            `SELECT COALESCE(SUM(amount), 0) as current_balance FROM coin_transactions ${statsWhere}`,
            statsParams
        );

        // 获取统计数据（根据权限）
        const statsResult = await query(`
            SELECT
                transaction_type,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM coin_transactions
            ${statsWhere}
            GROUP BY transaction_type
        `, statsParams);

        const stats = {
            current_balance: parseFloat(balanceResult.rows[0].current_balance),
            transaction_summary: statsResult.rows.reduce((acc: any, row: any) => {
                acc[row.transaction_type] = {
                    count: parseInt(row.count),
                    total_amount: parseFloat(row.total_amount)
                };
                return acc;
            }, {})
        };

        res.json({
            success: true,
            data: {
                transactions: result.rows,
                stats
            }
        } as ApiResponse);

    } catch (error) {
        console.error('获取金币流水错误:', error);
        res.status(500).json({
            success: false,
            error: '获取金币流水失败'
        });
    }
});

// 创建金币交易记录(手动调整)
router.post('/', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const { transaction_type, amount, description, account_id } = req.body;

        if (!transaction_type || !amount || !description) {
            return res.status(400).json({
                success: false,
                error: '交易类型、金额和描述不能为空'
            });
        }

        // 获取当前余额
        const balanceResult = await query(
            'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
            [userId]
        );
        const currentBalance = parseFloat(balanceResult.rows[0].balance);

        // 生成交易ID
        const transactionId = `MANUAL${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

        const result = await query(`
            INSERT INTO coin_transactions (
                user_id, account_id, transaction_id, transaction_type,
                description, amount, balance_before, balance_after
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            userId,
            account_id || null,
            transactionId,
            transaction_type,
            description,
            parseFloat(amount),
            currentBalance,
            currentBalance + parseFloat(amount)
        ]);

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: '金币交易记录创建成功'
        } as ApiResponse<CoinTransaction>);

    } catch (error) {
        console.error('创建金币交易错误:', error);
        res.status(500).json({
            success: false,
            error: '创建金币交易失败'
        });
    }
});

// 获取用户余额
router.get('/balance', async (req: any, res) => {
    try {
        const userId = req.user.id;

        const result = await query(
            'SELECT COALESCE(SUM(amount), 0) as balance FROM coin_transactions WHERE user_id = $1',
            [userId]
        );

        res.json({
            success: true,
            data: {
                balance: parseFloat(result.rows[0].balance),
                currency: 'CNY'
            }
        } as ApiResponse);

    } catch (error) {
        console.error('获取用户余额错误:', error);
        res.status(500).json({
            success: false,
            error: '获取用户余额失败'
        });
    }
});

// 获取金币统计分析
router.get('/analytics', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { period = '7d' } = req.query;

        let dateFilter = '';
        switch (period) {
            case '1d':
                dateFilter = "AND created_at >= CURRENT_DATE";
                break;
            case '7d':
                dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
                break;
            case '30d':
                dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
                break;
            case '90d':
                dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '90 days'";
                break;
        }

        // 构建权限过滤条件
        let userFilter = '';
        const params: any[] = [];

        if (userRole === 'admin') {
            // 管理员查看所有数据
            userFilter = '';
        } else if (userRole === 'agent') {
            // 代理查看自己和下属员工的数据
            userFilter = 'AND (user_id = $1 OR user_id IN (SELECT id FROM users WHERE agent_id = $1))';
            params.push(userId);
        } else {
            // 普通员工只看自己的数据
            userFilter = 'AND user_id = $1';
            params.push(userId);
        }

        // 日度统计
        const dailyResult = await query(`
            SELECT
                DATE(created_at) as date,
                transaction_type,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM coin_transactions
            WHERE 1=1 ${userFilter} ${dateFilter}
            GROUP BY DATE(created_at), transaction_type
            ORDER BY date DESC
        `, params);

        // 总体统计
        const totalResult = await query(`
            SELECT
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) as total_expense,
                COALESCE(SUM(amount), 0) as net_amount
            FROM coin_transactions
            WHERE 1=1 ${userFilter} ${dateFilter}
        `, params);

        res.json({
            success: true,
            data: {
                period,
                daily_stats: dailyResult.rows,
                summary: totalResult.rows[0]
            }
        } as ApiResponse);

    } catch (error) {
        console.error('获取金币统计错误:', error);
        res.status(500).json({
            success: false,
            error: '获取金币统计失败'
        });
    }
});

// 充值接口
router.post('/recharge', async (req: any, res) => {
    try {
        const currentUser = req.user;
        const { target_user_id, amount, description } = req.body;

        // 参数验证
        if (!target_user_id || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: '目标用户ID和充值金额不能为空，且金额必须大于0'
            });
        }

        const rechargeAmount = parseFloat(amount);

        // 获取目标用户信息
        const targetUserResult = await query(
            'SELECT id, username, role, parent_id, agent_id FROM users WHERE id = $1',
            [target_user_id]
        );

        if (targetUserResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '目标用户不存在'
            });
        }

        const targetUser = targetUserResult.rows[0];

        // 权限检查
        if (currentUser.role === 'admin') {
            // admin 可以给任何 agent 或 staff 充值
            if (targetUser.role !== 'agent' && targetUser.role !== 'staff') {
                return res.status(403).json({
                    success: false,
                    error: '只能给代理或员工充值'
                });
            }
        } else if (currentUser.role === 'agent') {
            // agent 只能给自己的 staff 充值
            if (targetUser.role !== 'staff' || targetUser.parent_id !== currentUser.id) {
                return res.status(403).json({
                    success: false,
                    error: '代理只能给自己的员工充值'
                });
            }

            // 检查代理余额是否足够
            const agentBalance = await getUserBalance(currentUser.id);
            if (agentBalance < rechargeAmount) {
                return res.status(400).json({
                    success: false,
                    error: `余额不足，当前余额：${agentBalance.toFixed(2)}，需要：${rechargeAmount.toFixed(2)}`
                });
            }
        } else {
            // staff 不能充值
            return res.status(403).json({
                success: false,
                error: '员工无权进行充值操作'
            });
        }

        // 开始事务
        await query('BEGIN');

        try {
            // 如果是 agent 充值，需要扣除 agent 的金币
            if (currentUser.role === 'agent') {
                const agentBalance = await getUserBalance(currentUser.id);
                const transactionId = generateTransactionId('RECHARGE_OUT_');

                await query(`
                    INSERT INTO coin_transactions (
                        user_id, transaction_id, transaction_type,
                        description, amount, balance_before, balance_after
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    currentUser.id,
                    transactionId,
                    '转账',
                    description || `充值给 ${targetUser.username}`,
                    -rechargeAmount,
                    agentBalance,
                    agentBalance - rechargeAmount
                ]);
            }

            // 给目标用户增加金币
            const targetBalance = await getUserBalance(target_user_id);
            const transactionId = generateTransactionId('RECHARGE_IN_');

            await query(`
                INSERT INTO coin_transactions (
                    user_id, transaction_id, transaction_type,
                    description, amount, balance_before, balance_after
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                target_user_id,
                transactionId,
                '充值',
                description || `来自 ${currentUser.username} 的充值`,
                rechargeAmount,
                targetBalance,
                targetBalance + rechargeAmount
            ]);

            await query('COMMIT');

            res.json({
                success: true,
                message: '充值成功',
                data: {
                    target_user_id,
                    target_username: targetUser.username,
                    amount: rechargeAmount,
                    new_balance: targetBalance + rechargeAmount
                }
            } as ApiResponse);

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('充值错误:', error);
        res.status(500).json({
            success: false,
            error: '充值失败'
        });
    }
});

// 转账接口（代理之间互转）
router.post('/transfer', async (req: any, res) => {
    try {
        const currentUser = req.user;
        const { target_user_id, amount, description } = req.body;

        // 参数验证
        if (!target_user_id || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: '目标用户ID和转账金额不能为空，且金额必须大于0'
            });
        }

        const transferAmount = parseFloat(amount);

        // 只有 agent 可以转账
        if (currentUser.role !== 'agent') {
            return res.status(403).json({
                success: false,
                error: '只有代理可以进行转账操作'
            });
        }

        // 不能给自己转账
        if (target_user_id === currentUser.id) {
            return res.status(400).json({
                success: false,
                error: '不能给自己转账'
            });
        }

        // 获取目标用户信息
        const targetUserResult = await query(
            'SELECT id, username, role FROM users WHERE id = $1',
            [target_user_id]
        );

        if (targetUserResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '目标用户不存在'
            });
        }

        const targetUser = targetUserResult.rows[0];

        // 只能给其他 agent 转账
        if (targetUser.role !== 'agent') {
            return res.status(403).json({
                success: false,
                error: '只能给其他代理转账'
            });
        }

        // 检查发起方余额
        const senderBalance = await getUserBalance(currentUser.id);
        if (senderBalance < transferAmount) {
            return res.status(400).json({
                success: false,
                error: `余额不足，当前余额：${senderBalance.toFixed(2)}，需要：${transferAmount.toFixed(2)}`
            });
        }

        // 开始事务
        await query('BEGIN');

        try {
            // 扣除发起方金币
            const senderTransactionId = generateTransactionId('TRANSFER_OUT_');
            await query(`
                INSERT INTO coin_transactions (
                    user_id, transaction_id, transaction_type,
                    description, amount, balance_before, balance_after
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                currentUser.id,
                senderTransactionId,
                '转账',
                description || `转账给 ${targetUser.username}`,
                -transferAmount,
                senderBalance,
                senderBalance - transferAmount
            ]);

            // 增加接收方金币
            const receiverBalance = await getUserBalance(target_user_id);
            const receiverTransactionId = generateTransactionId('TRANSFER_IN_');
            await query(`
                INSERT INTO coin_transactions (
                    user_id, transaction_id, transaction_type,
                    description, amount, balance_before, balance_after
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                target_user_id,
                receiverTransactionId,
                '收款',
                description || `来自 ${currentUser.username} 的转账`,
                transferAmount,
                receiverBalance,
                receiverBalance + transferAmount
            ]);

            await query('COMMIT');

            res.json({
                success: true,
                message: '转账成功',
                data: {
                    sender_id: currentUser.id,
                    sender_username: currentUser.username,
                    sender_new_balance: senderBalance - transferAmount,
                    receiver_id: target_user_id,
                    receiver_username: targetUser.username,
                    receiver_new_balance: receiverBalance + transferAmount,
                    amount: transferAmount
                }
            } as ApiResponse);

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('转账错误:', error);
        res.status(500).json({
            success: false,
            error: '转账失败'
        });
    }
});

export { router as coinRoutes };