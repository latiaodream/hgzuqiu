import express from 'express';
import { query } from '../models/database';
import { OddsApiService } from '../services/oddsapi.service';

const router = express.Router();

/**
 * 获取赛事列表
 * GET /api/oddsapi/events
 */
router.get('/events', async (req, res) => {
    try {
        const {
            sport = 'football',
            league,
            status = 'pending',
            limit = 100,
            offset = 0
        } = req.query;

        let sql = `
            SELECT 
                e.*,
                json_agg(
                    json_build_object(
                        'market_name', o.market_name,
                        'ml_home', o.ml_home,
                        'ml_draw', o.ml_draw,
                        'ml_away', o.ml_away,
                        'spread_hdp', o.spread_hdp,
                        'spread_home', o.spread_home,
                        'spread_away', o.spread_away,
                        'totals_hdp', o.totals_hdp,
                        'totals_over', o.totals_over,
                        'totals_under', o.totals_under,
                        'updated_at', o.updated_at
                    )
                ) FILTER (WHERE o.id IS NOT NULL) as odds
            FROM oddsapi_events e
            LEFT JOIN oddsapi_odds o ON e.id = o.event_id AND o.bookmaker = 'Crown'
            WHERE e.sport_slug = $1
        `;

        const params: any[] = [sport];
        let paramIndex = 2;

        if (league) {
            sql += ` AND e.league_slug = $${paramIndex}`;
            params.push(league);
            paramIndex++;
        }

        if (status) {
            sql += ` AND e.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        sql += ` GROUP BY e.id ORDER BY e.date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });
    } catch (error: any) {
        console.error('❌ 获取赛事列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取单个赛事详情
 * GET /api/oddsapi/events/:id
 */
router.get('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const eventResult = await query(
            `SELECT * FROM oddsapi_events WHERE id = $1`,
            [id]
        );

        if (eventResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '赛事不存在'
            });
        }

        const oddsResult = await query(
            `SELECT * FROM oddsapi_odds WHERE event_id = $1 AND bookmaker = 'Crown'`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...eventResult.rows[0],
                odds: oddsResult.rows
            }
        });
    } catch (error: any) {
        console.error('❌ 获取赛事详情失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取联赛列表
 * GET /api/oddsapi/leagues
 */
router.get('/leagues', async (req, res) => {
    try {
        const { sport = 'football' } = req.query;

        const result = await query(
            `SELECT DISTINCT league_name, league_slug, COUNT(*) as event_count
             FROM oddsapi_events
             WHERE sport_slug = $1 AND status = 'pending'
             GROUP BY league_name, league_slug
             ORDER BY event_count DESC`,
            [sport]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error: any) {
        console.error('❌ 获取联赛列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 手动触发数据同步
 * POST /api/oddsapi/sync
 */
router.post('/sync', async (req, res) => {
    try {
        const { sport = 'football' } = req.body;

        console.log(`🔄 手动触发数据同步: ${sport}`);
        
        // 异步执行同步，立即返回响应
        OddsApiService.syncData(sport).then(result => {
            console.log(`✅ 同步完成:`, result);
        }).catch(error => {
            console.error(`❌ 同步失败:`, error);
        });

        res.json({
            success: true,
            message: '数据同步已启动'
        });
    } catch (error: any) {
        console.error('❌ 触发同步失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取统计信息
 * GET /api/oddsapi/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const statsResult = await query(`
            SELECT 
                COUNT(*) as total_events,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_events,
                COUNT(*) FILTER (WHERE status = 'live') as live_events,
                COUNT(*) FILTER (WHERE status = 'settled') as settled_events,
                COUNT(DISTINCT league_slug) as total_leagues,
                COUNT(DISTINCT sport_slug) as total_sports
            FROM oddsapi_events
        `);

        const oddsStatsResult = await query(`
            SELECT 
                COUNT(*) as total_odds,
                COUNT(DISTINCT event_id) as events_with_odds
            FROM oddsapi_odds
            WHERE bookmaker = 'Crown'
        `);

        res.json({
            success: true,
            data: {
                ...statsResult.rows[0],
                ...oddsStatsResult.rows[0]
            }
        });
    } catch (error: any) {
        console.error('❌ 获取统计信息失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;

