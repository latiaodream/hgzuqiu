import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getCrownSiteManager } from '../services/crown-site-manager';
import { ApiResponse } from '../types';

const router = Router();

// 所有路由都需要认证
router.use(authenticateToken);

/**
 * 获取所有站点信息
 * GET /api/crown-sites
 */
router.get('/', async (req: any, res) => {
  try {
    const siteManager = getCrownSiteManager();
    const sites = siteManager.getAllSites();
    const currentSite = siteManager.getCurrentSite();

    res.json({
      success: true,
      data: {
        sites,
        currentSite,
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取站点列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取站点列表失败',
    } as ApiResponse);
  }
});

/**
 * 获取当前站点信息
 * GET /api/crown-sites/current
 */
router.get('/current', async (req: any, res) => {
  try {
    const siteManager = getCrownSiteManager();
    const currentSite = siteManager.getCurrentSite();
    const currentSiteInfo = siteManager.getCurrentSiteInfo();

    res.json({
      success: true,
      data: {
        url: currentSite,
        info: currentSiteInfo,
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取当前站点失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取当前站点失败',
    } as ApiResponse);
  }
});

/**
 * 手动切换站点
 * POST /api/crown-sites/switch
 * Body: { url: string }
 */
router.post('/switch', async (req: any, res) => {
  try {
    // 只有 admin 可以切换站点
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '只有管理员可以切换站点',
      } as ApiResponse);
    }

    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: '缺少站点URL',
      } as ApiResponse);
    }

    const siteManager = getCrownSiteManager();
    const success = siteManager.switchSite(url);

    if (success) {
      res.json({
        success: true,
        data: {
          currentSite: siteManager.getCurrentSite(),
          message: '站点切换成功',
        },
      } as ApiResponse);
    } else {
      res.status(400).json({
        success: false,
        error: '站点不存在或切换失败',
      } as ApiResponse);
    }
  } catch (error: any) {
    console.error('切换站点失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '切换站点失败',
    } as ApiResponse);
  }
});

/**
 * 自动切换到可用站点
 * POST /api/crown-sites/auto-switch
 */
router.post('/auto-switch', async (req: any, res) => {
  try {
    // 只有 admin 可以触发自动切换
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '只有管理员可以触发自动切换',
      } as ApiResponse);
    }

    const siteManager = getCrownSiteManager();
    const newSite = await siteManager.autoSwitchToAvailableSite();

    if (newSite) {
      res.json({
        success: true,
        data: {
          currentSite: newSite,
          message: '已切换到可用站点',
        },
      } as ApiResponse);
    } else {
      res.status(400).json({
        success: false,
        error: '没有可用的备用站点',
      } as ApiResponse);
    }
  } catch (error: any) {
    console.error('自动切换站点失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '自动切换站点失败',
    } as ApiResponse);
  }
});

/**
 * 手动触发健康检查
 * POST /api/crown-sites/health-check
 */
router.post('/health-check', async (req: any, res) => {
  try {
    // 只有 admin 可以触发健康检查
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '只有管理员可以触发健康检查',
      } as ApiResponse);
    }

    const siteManager = getCrownSiteManager();
    await siteManager.triggerHealthCheck();

    const sites = siteManager.getAllSites();

    res.json({
      success: true,
      data: {
        sites,
        message: '健康检查完成',
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('健康检查失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '健康检查失败',
    } as ApiResponse);
  }
});

export default router;

