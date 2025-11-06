import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import { nameAliasService } from '../services/name-alias-service';
import { importLeaguesFromExcel, importTeamsFromExcel } from '../services/alias-import-service';

const router = Router();
router.use(authenticateToken);

const ensureAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '仅管理员可访问' });
  }
  return next();
};

// 配置文件上传
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('只支持 Excel 文件 (.xlsx, .xls)'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

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

// 导入联赛翻译（Excel 文件上传）
router.post('/leagues/import', ensureAdmin, upload.single('file'), async (req, res) => {
  let filePath: string | undefined;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传文件' });
    }

    filePath = req.file.path;
    console.log(`📥 开始导入联赛翻译: ${req.file.originalname}`);

    const result = await importLeaguesFromExcel(filePath);

    // 删除临时文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: '导入失败',
        details: result.errors,
      });
    }

    res.json({
      success: true,
      data: {
        type: result.type,
        total: result.total,
        updated: result.updated,
        skipped: result.skipped,
        notFound: result.notFound,
      },
      message: `导入完成：更新 ${result.updated} 个，跳过 ${result.skipped} 个，未找到 ${result.notFound} 个`,
    });

  } catch (error: any) {
    console.error('导入联赛翻译失败:', error);

    // 清理临时文件
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({
      success: false,
      error: error.message || '导入联赛翻译失败',
    });
  }
});

// 导入球队翻译（Excel 文件上传）
router.post('/teams/import', ensureAdmin, upload.single('file'), async (req, res) => {
  let filePath: string | undefined;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传文件' });
    }

    filePath = req.file.path;
    console.log(`📥 开始导入球队翻译: ${req.file.originalname}`);

    const result = await importTeamsFromExcel(filePath);

    // 删除临时文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: '导入失败',
        details: result.errors,
      });
    }

    res.json({
      success: true,
      data: {
        type: result.type,
        total: result.total,
        updated: result.updated,
        skipped: result.skipped,
        notFound: result.notFound,
      },
      message: `导入完成：更新 ${result.updated} 个，跳过 ${result.skipped} 个，未找到 ${result.notFound} 个`,
    });

  } catch (error: any) {
    console.error('导入球队翻译失败:', error);

    // 清理临时文件
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({
      success: false,
      error: error.message || '导入球队翻译失败',
    });
  }
});

// GET /api/aliases/leagues/export-untranslated
router.get('/leagues/export-untranslated', ensureAdmin, async (req, res) => {
  try {
    console.log('📤 导出未翻译的联赛...');

    const leagues = await nameAliasService.listLeagueAliases();
    const untranslated = leagues.filter(league => !league.name_zh_cn || league.name_zh_cn.trim() === '');

    if (untranslated.length === 0) {
      return res.status(404).json({
        success: false,
        error: '没有未翻译的联赛',
      });
    }

    // 创建 Excel 数据
    const data = untranslated.map(league => [
      league.name_en || '',
      '', // 空的简体中文列，等待填写
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Untranslated Leagues');

    // 生成 buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leagues-untranslated-${Date.now()}.xlsx"`);
    res.send(buffer);

    console.log(`✅ 导出 ${untranslated.length} 个未翻译的联赛`);

  } catch (error: any) {
    console.error('导出未翻译联赛失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '导出失败',
    });
  }
});

// GET /api/aliases/teams/export-untranslated
router.get('/teams/export-untranslated', ensureAdmin, async (req, res) => {
  try {
    console.log('📤 导出未翻译的球队...');

    const teams = await nameAliasService.listTeamAliases();
    const untranslated = teams.filter(team => !team.name_zh_cn || team.name_zh_cn.trim() === '');

    if (untranslated.length === 0) {
      return res.status(404).json({
        success: false,
        error: '没有未翻译的球队',
      });
    }

    // 创建 Excel 数据
    const data = untranslated.map(team => [
      team.name_en || '',
      '', // 空的简体中文列，等待填写
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Untranslated Teams');

    // 生成 buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="teams-untranslated-${Date.now()}.xlsx"`);
    res.send(buffer);

    console.log(`✅ 导出 ${untranslated.length} 个未翻译的球队`);

  } catch (error: any) {
    console.error('导出未翻译球队失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '导出失败',
    });
  }
});

export { router as aliasRoutes };
