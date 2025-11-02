import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { CrownApiClient } from '../src/services/crown-api-client';

type ShowTypeConfig = {
  label: string;
  params: {
    showtype: string;
    rtype: string;
  };
};

type CrownMatch = {
  crown_gid: string;
  league: string;
  league_id: string;
  home: string;
  away: string;
  datetime: string;
  raw: any;
  source_showtype: string;
};

const SHOWTYPE_CONFIGS: ShowTypeConfig[] = [
  { label: 'live', params: { showtype: 'live', rtype: 'rb' } },
  { label: 'today', params: { showtype: 'today', rtype: 'r' } },
  { label: 'early', params: { showtype: 'early', rtype: 'r' } },
];

async function main() {
  const username = process.env.CROWN_USERNAME;
  const password = process.env.CROWN_PASSWORD;
  const baseUrl = process.env.CROWN_BASE_URL || 'https://hga038.com';
  const outputFile = process.env.CROWN_GID_OUTPUT || path.resolve(process.cwd(), 'crown-gids.json');

  if (!username || !password) {
    console.error('❌ 请在环境变量中设置 CROWN_USERNAME 和 CROWN_PASSWORD');
    process.exit(1);
  }

  const client = new CrownApiClient({ baseUrl });

  console.log(`🔐 使用账号 ${username} 登录 ${baseUrl} ...`);
  const loginResult = await client.login(username, password, 1);

  // 判断登录是否成功
  // 皇冠 API 返回: status='200' 或 status='success'，并且 msg='100' 表示登录成功
  // 同时必须有 uid 字段
  const status = String(loginResult.status || '').toLowerCase();
  const msg = String(loginResult.msg || '').trim();
  const isLoginSuccess =
    (status === 'success' || status === '200' || status === '200 success' || msg === '100') &&
    !!loginResult.uid;

  if (!isLoginSuccess) {
    console.error('❌ 登录失败:', loginResult);
    process.exit(1);
  }
  console.log('✅ 登录成功，UID:', loginResult.uid);

  const matchesMap: Map<string, CrownMatch> = new Map();

  for (const showtypeConfig of SHOWTYPE_CONFIGS) {
    const { label, params } = showtypeConfig;
    console.log(`\n📋 获取 ${label} 赛事 ...`);
    try {
      const xml = await client.getGameList({
        gtype: 'ft',
        showtype: params.showtype,
        rtype: params.rtype,
        ltype: '3',
        sorttype: 'L',
      });

      const parsed = await parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: false,
      });

      const serverResponse = parsed?.serverresponse;
      if (!serverResponse) {
        console.warn(`⚠️ ${label} 响应缺少 serverresponse 节点，跳过`);
        continue;
      }

      const ecNode = serverResponse.ec;
      if (!ecNode) {
        console.warn(`⚠️ ${label} 响应没有比赛数据`);
        continue;
      }

      const ecList = Array.isArray(ecNode) ? ecNode : [ecNode];

      for (const ec of ecList) {
        const games = ec.game;
        if (!games) continue;
        const gameList = Array.isArray(games) ? games : [games];

        for (const game of gameList) {
          const gie = game?.GID || game?.gid;
          if (!gie) continue;
          const gid = String(gie);

          if (matchesMap.has(gid)) continue;

          matchesMap.set(gid, {
            crown_gid: gid,
            league: String(game?.LEAGUE || game?.league || ''),
            league_id: String(game?.LID || game?.lid || ''),
            home: String(game?.TEAM_H || game?.team_h || ''),
            away: String(game?.TEAM_C || game?.team_c || ''),
            datetime: String(game?.DATETIME || game?.datetime || ''),
            raw: game,
            source_showtype: label,
          });
        }
      }

      console.log(`✅ ${label} 赛事收集完成，共 ${matchesMap.size} 场 (累计)`);
    } catch (error: any) {
      console.error(`❌ 获取 ${label} 赛事失败:`, error.message || error);
    }
  }

  const outputData = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    showtypes: SHOWTYPE_CONFIGS.map((c) => c.label),
    matchCount: matchesMap.size,
    matches: Array.from(matchesMap.values()),
  };

  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n💾 已写入 ${matchesMap.size} 场比赛到 ${outputFile}`);

  await client.close();
}

main().catch((error) => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
