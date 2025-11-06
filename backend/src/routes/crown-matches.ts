import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { crownMatchService } from '../services/crown-match-service';

const router = Router();
router.use(authenticateToken);

const ensureAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '仅管理员可访问' });
  }
  return next();
};

// GET /api/crown-matches - 获取赛事列表
router.get('/', ensureAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const leagueMatched = req.query.leagueMatched === 'true' ? true : req.query.leagueMatched === 'false' ? false : undefined;
    const homeMatched = req.query.homeMatched === 'true' ? true : req.query.homeMatched === 'false' ? false : undefined;
    const awayMatched = req.query.awayMatched === 'true' ? true : req.query.awayMatched === 'false' ? false : undefined;

    const result = await crownMatchService.listMatches({
      page,
      pageSize,
      leagueMatched,
      homeMatched,
      awayMatched,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('获取赛事列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取赛事列表失败',
    });
  }
});

// GET /api/crown-matches/stats - 获取匹配统计
router.get('/stats', ensureAdmin, async (req, res) => {
  try {
    const stats = await crownMatchService.getMatchStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('获取匹配统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取匹配统计失败',
    });
  }
});

// GET /api/crown-matches/unmatched-leagues - 获取未匹配的联赛
router.get('/unmatched-leagues', ensureAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const leagues = await crownMatchService.getUnmatchedLeagues(limit);

    res.json({
      success: true,
      data: leagues,
    });
  } catch (error: any) {
    console.error('获取未匹配联赛失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取未匹配联赛失败',
    });
  }
});

// GET /api/crown-matches/unmatched-teams - 获取未匹配的球队
router.get('/unmatched-teams', ensureAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const teams = await crownMatchService.getUnmatchedTeams(limit);

    res.json({
      success: true,
      data: teams,
    });
  } catch (error: any) {
    console.error('获取未匹配球队失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取未匹配球队失败',
    });
  }
});

// DELETE /api/crown-matches/old - 删除过期赛事
router.delete('/old', ensureAdmin, async (req, res) => {
  try {
    const daysAgo = parseInt(req.query.daysAgo as string) || 7;
    const count = await crownMatchService.deleteOldMatches(daysAgo);

    res.json({
      success: true,
      data: { deleted: count },
      message: `已删除 ${count} 场过期赛事`,
    });
  } catch (error: any) {
    console.error('删除过期赛事失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '删除过期赛事失败',
    });
  }
});

export { router as crownMatchRoutes };

