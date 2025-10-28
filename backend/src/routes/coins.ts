import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../models/database';
import { ApiResponse, CoinTransaction } from '../types';

const router = Router();
router.use(authenticateToken);

// 获取金币流水记录
router.get('/', async (req: any, res) => {
    try {
        const userId = req.user.id;
        const { type, start_date, end_date, limit = 50, offset = 0 } = req.query;

        let sql = `
            SELECT ct.*, ca.username as account_username, ca.display_name as account_display_name
            FROM coin_transactions ct
            LEFT JOIN crown_accounts ca ON ct.account_id = ca.id
            WHERE ct.user_id = $1
        `;
        const params = [userId];
        let paramIndex = 2;

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

        // 获取当前余额
        const balanceResult = await query(
            'SELECT COALESCE(SUM(amount), 0) as current_balance FROM coin_transactions WHERE user_id = $1',
            [userId]
        );

        // 获取统计数据
        const statsResult = await query(`
            SELECT 
                transaction_type,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM coin_transactions 
            WHERE user_id = $1
            GROUP BY transaction_type
        `, [userId]);

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

        // 日度统计
        const dailyResult = await query(`
            SELECT 
                DATE(created_at) as date,
                transaction_type,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM coin_transactions 
            WHERE user_id = $1 ${dateFilter}
            GROUP BY DATE(created_at), transaction_type
            ORDER BY date DESC
        `, [userId]);

        // 总体统计
        const totalResult = await query(`
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) as total_expense,
                COALESCE(SUM(amount), 0) as net_amount
            FROM coin_transactions 
            WHERE user_id = $1 ${dateFilter}
        `, [userId]);

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

export { router as coinRoutes };