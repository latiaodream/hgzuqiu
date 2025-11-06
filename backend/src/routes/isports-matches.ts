import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { ISportsClient } from '../services/isports-client';
import { pool } from '../config/database';

const router = Router();
router.use(authenticateToken);

const ensureAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '仅管理员可访问' });
  }
  return next();
};

// 初始化 iSports 客户端
const isportsClient = new ISportsClient(
  process.env.ISPORTS_API_KEY || 'GvpziueL9ouzIJNj'
);

/**
 * 根据 iSports 名称查找映射的简体中文名称
 */
async function findMappedName(
  type: 'league' | 'team',
  isportsName: string
): Promise<{ mapped: boolean; name: string }> {
  try {
    const tableName = type === 'league' ? 'league_aliases' : 'team_aliases';

    // 1. 尝试精确匹配 name_zh_tw (iSports 使用繁体中文)
    let result = await pool.query(
      `SELECT name_zh_cn FROM ${tableName} WHERE name_zh_tw = $1 LIMIT 1`,
      [isportsName]
    );

    if (result.rows.length > 0) {
      return { mapped: true, name: result.rows[0].name_zh_cn };
    }

    // 2. 尝试精确匹配 name_en (iSports 也可能返回英文)
    result = await pool.query(
      `SELECT name_zh_cn FROM ${tableName} WHERE name_en = $1 LIMIT 1`,
      [isportsName]
    );

    if (result.rows.length > 0) {
      return { mapped: true, name: result.rows[0].name_zh_cn };
    }

    // 3. 未找到映射，返回原名
    return { mapped: false, name: isportsName };
  } catch (error) {
    console.error(`查找映射失败 (${type}):`, error);
    return { mapped: false, name: isportsName };
  }
}

/**
 * 获取 iSports 赛事列表（带名称映射，仅返回有皇冠赔率的赛事）
 * GET /api/isports-matches?date=2025-11-06
 */
router.get('/', ensureAdmin, async (req, res) => {
  try {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];

    console.log(`📥 获取 iSports 赛事列表: ${date}`);

    // 1. 获取所有赛事
    const matches = await isportsClient.getSchedule(date);
    console.log(`✅ 获取到 ${matches.length} 场赛事`);

    // 2. 获取皇冠赔率（只获取有赔率的比赛）
    const matchIds = matches.map(m => m.matchId);
    console.log(`📥 获取皇冠赔率...`);

    const oddsData = await isportsClient.getMainOdds(matchIds, ['3']); // companyId=3 是皇冠

    // 3. 筛选出有皇冠赔率的比赛
    const matchesWithOdds = matches.filter(match => {
      const hasHandicap = oddsData.handicap.some(h => h.matchId === match.matchId && h.companyId === '3');
      const hasEurope = oddsData.europeOdds.some(e => e.matchId === match.matchId && e.companyId === '3');
      const hasOverUnder = oddsData.overUnder.some(o => o.matchId === match.matchId && o.companyId === '3');
      return hasHandicap || hasEurope || hasOverUnder;
    });

    console.log(`✅ 筛选出 ${matchesWithOdds.length} 场有皇冠赔率的赛事`);

    // 4. 为每场比赛添加映射后的中文名称
    const matchesWithMapping = await Promise.all(
      matchesWithOdds.map(async (match) => {
        const leagueMapping = await findMappedName('league', match.leagueName);
        const homeMapping = await findMappedName('team', match.homeName);
        const awayMapping = await findMappedName('team', match.awayName);

        return {
          ...match,
          // 映射后的名称
          leagueNameZhCn: leagueMapping.name,
          homeNameZhCn: homeMapping.name,
          awayNameZhCn: awayMapping.name,
          // 是否已映射
          leagueMapped: leagueMapping.mapped,
          homeMapped: homeMapping.mapped,
          awayMapped: awayMapping.mapped,
        };
      })
    );

    res.json({
      success: true,
      data: {
        matches: matchesWithMapping,
        total: matchesWithMapping.length,
        totalAll: matches.length,
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

