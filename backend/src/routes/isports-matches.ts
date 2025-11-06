import { Router } from 'express';
import { ensureAdmin } from '../middleware/auth';
import { ISportsClient } from '../services/isports-client';

const router = Router();

// 初始化 iSports 客户端
const isportsClient = new ISportsClient(
  process.env.ISPORTS_API_KEY || 'GvpziueL9ouzIJNj'
);

/**
 * 获取 iSports 赛事列表
 * GET /api/isports-matches?date=2025-11-06
 */
router.get('/', ensureAdmin, async (req, res) => {
  try {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];
    
    console.log(`📥 获取 iSports 赛事列表: ${date}`);
    
    const matches = await isportsClient.getSchedule(date);
    
    res.json({
      success: true,
      data: {
        matches,
        total: matches.length,
        date,
      },
    });
  } catch (error: any) {
    console.error('❌ 获取 iSports 赛事失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取赛事失败',
    });
  }
});

export default router;

