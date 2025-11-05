import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { nameAliasService } from '../services/name-alias-service';

const router = Router();
router.use(authenticateToken);

const ensureAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '仅管理员可访问' });
  }
  return next();
};

const parseAliasesInput = (input: any): string[] => {
  if (!input && input !== 0) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[\n,;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

router.get('/leagues', ensureAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const records = await nameAliasService.listLeagues(search);
    res.json({ success: true, data: records });
  } catch (error: any) {
    console.error('获取联赛别名失败:', error);
    res.status(500).json({ success: false, error: '获取联赛别名失败' });
  }
});

router.post('/leagues', ensureAdmin, async (req, res) => {
  try {
    const payload = {
      canonicalKey: typeof req.body.canonical_key === 'string' ? req.body.canonical_key.trim() : undefined,
      nameEn: req.body.name_en ?? null,
      nameZhCn: req.body.name_zh_cn ?? null,
      nameZhTw: req.body.name_zh_tw ?? null,
      aliases: parseAliasesInput(req.body.aliases),
    };
    const record = await nameAliasService.createLeagueAlias(payload);
    res.json({ success: true, data: record });
  } catch (error: any) {
    console.error('创建联赛别名失败:', error);
    res.status(400).json({ success: false, error: error.message || '创建联赛别名失败' });
  }
});

router.put('/leagues/:id', ensureAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效的 ID' });
    }
    const payload = {
      canonicalKey: typeof req.body.canonical_key === 'string' ? req.body.canonical_key.trim() : undefined,
      nameEn: req.body.name_en ?? null,
      nameZhCn: req.body.name_zh_cn ?? null,
      nameZhTw: req.body.name_zh_tw ?? null,
      aliases: parseAliasesInput(req.body.aliases),
    };
    const record = await nameAliasService.updateLeagueAlias(id, payload);
    res.json({ success: true, data: record });
  } catch (error: any) {
    console.error('更新联赛别名失败:', error);
    res.status(400).json({ success: false, error: error.message || '更新联赛别名失败' });
  }
});

router.delete('/leagues/:id', ensureAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效的 ID' });
    }
    await nameAliasService.deleteLeagueAlias(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除联赛别名失败:', error);
    res.status(500).json({ success: false, error: '删除联赛别名失败' });
  }
});

router.get('/teams', ensureAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const records = await nameAliasService.listTeams(search);
    res.json({ success: true, data: records });
  } catch (error: any) {
    console.error('获取球队别名失败:', error);
    res.status(500).json({ success: false, error: '获取球队别名失败' });
  }
});

router.post('/teams', ensureAdmin, async (req, res) => {
  try {
    const payload = {
      canonicalKey: typeof req.body.canonical_key === 'string' ? req.body.canonical_key.trim() : undefined,
      nameEn: req.body.name_en ?? null,
      nameZhCn: req.body.name_zh_cn ?? null,
      nameZhTw: req.body.name_zh_tw ?? null,
      aliases: parseAliasesInput(req.body.aliases),
    };
    const record = await nameAliasService.createTeamAlias(payload);
    res.json({ success: true, data: record });
  } catch (error: any) {
    console.error('创建球队别名失败:', error);
    res.status(400).json({ success: false, error: error.message || '创建球队别名失败' });
  }
});

router.put('/teams/:id', ensureAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效的 ID' });
    }
    const payload = {
      canonicalKey: typeof req.body.canonical_key === 'string' ? req.body.canonical_key.trim() : undefined,
      nameEn: req.body.name_en ?? null,
      nameZhCn: req.body.name_zh_cn ?? null,
      nameZhTw: req.body.name_zh_tw ?? null,
      aliases: parseAliasesInput(req.body.aliases),
    };
    const record = await nameAliasService.updateTeamAlias(id, payload);
    res.json({ success: true, data: record });
  } catch (error: any) {
    console.error('更新球队别名失败:', error);
    res.status(400).json({ success: false, error: error.message || '更新球队别名失败' });
  }
});

router.delete('/teams/:id', ensureAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效的 ID' });
    }
    await nameAliasService.deleteTeamAlias(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除球队别名失败:', error);
    res.status(500).json({ success: false, error: '删除球队别名失败' });
  }
});

export { router as aliasRoutes };
