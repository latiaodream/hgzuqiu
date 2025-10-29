/**
 * 独立的赛事抓取服务
 * 使用专用账号持续抓取赛事数据，不依赖用户账号
 */

import { CrownApiClient } from './crown-api-client';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs/promises';

interface FetchConfig {
  username: string;
  password: string;
  baseUrl: string;
  deviceType?: string;
  userAgent?: string;
}

interface MatchData {
  matches: any[];
  lastUpdate: number;
  xml?: string;
}

export class MatchFetcher {
  private config: FetchConfig;
  private apiClient: CrownApiClient | null = null;
  private uid: string | null = null;
  private loginTime: number = 0;
  private fetchTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private latestMatches: MatchData = { matches: [], lastUpdate: 0 };
  private fetchInterval: number = 1000; // 1秒刷新一次

  constructor(config: FetchConfig) {
    this.config = {
      deviceType: 'iPhone 14',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      ...config,
    };
  }

  /**
   * 启动抓取服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ 抓取服务已在运行中');
      return;
    }

    console.log('🚀 启动独立抓取服务...');
    this.isRunning = true;

    // 先登录
    await this.login();

    // 启动定时抓取
    this.startFetching();
  }

  /**
   * 停止抓取服务
   */
  async stop(): Promise<void> {
    console.log('🛑 停止独立抓取服务...');
    this.isRunning = false;

    if (this.fetchTimer) {
      clearInterval(this.fetchTimer);
      this.fetchTimer = null;
    }

    if (this.apiClient) {
      await this.apiClient.close();
      this.apiClient = null;
    }

    this.uid = null;
    this.loginTime = 0;
  }

  /**
   * 登录
   */
  private async login(): Promise<void> {
    try {
      console.log(`🔐 使用专用账号登录: ${this.config.username}`);

      // 创建 API 客户端
      this.apiClient = new CrownApiClient({
        baseUrl: this.config.baseUrl,
        deviceType: this.config.deviceType!,
        userAgent: this.config.userAgent,
      });

      // 登录
      const loginResult = await this.apiClient.login(
        this.config.username,
        this.config.password
      );

      if (loginResult.success && loginResult.uid) {
        this.uid = loginResult.uid;
        this.loginTime = Date.now();
        console.log(`✅ 登录成功，UID: ${this.uid}`);
      } else {
        throw new Error(`登录失败: ${loginResult.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('❌ 登录失败:', error);
      throw error;
    }
  }

  /**
   * 检查会话是否有效
   */
  private isSessionValid(): boolean {
    if (!this.uid || !this.loginTime) {
      return false;
    }

    const now = Date.now();
    const sessionTtl = 2 * 60 * 60 * 1000; // 2小时
    return now - this.loginTime < sessionTtl;
  }

  /**
   * 启动定时抓取
   */
  private startFetching(): void {
    this.fetchTimer = setInterval(async () => {
      try {
        await this.fetchOnce();
      } catch (error) {
        console.error('❌ 抓取失败:', error);
      }
    }, this.fetchInterval);

    // 立即执行一次
    this.fetchOnce().catch(console.error);
  }

  /**
   * 执行一次抓取
   */
  private async fetchOnce(): Promise<void> {
    // 检查会话是否有效
    if (!this.isSessionValid()) {
      console.log('⚠️ 会话已过期，重新登录...');
      await this.login();
    }

    if (!this.apiClient || !this.uid) {
      console.error('❌ API 客户端未初始化');
      return;
    }

    try {
      // 抓取滚球赛事
      const xml = await this.apiClient.getGameList({
        gtype: 'ft',
        showtype: 'live',
        rtype: 'rb',
        ltype: '3',
        sorttype: 'L',
      });

      if (!xml) {
        console.warn('⚠️ 未获取到赛事数据');
        return;
      }

      // 检查是否是 doubleLogin 错误
      if (xml.includes('doubleLogin')) {
        console.warn('⚠️ 检测到重复登录，重新登录...');
        await this.login();
        return;
      }

      // 解析赛事
      const matches = this.parseMatchesFromXml(xml);
      console.log(`✅ 抓取到 ${matches.length} 场比赛`);

      // 为前10场比赛获取更多盘口
      await this.enrichMatches(matches.slice(0, 10));

      // 更新缓存
      this.latestMatches = {
        matches,
        lastUpdate: Date.now(),
        xml,
      };

      // 保存到文件（可选）
      try {
        await fs.writeFile('matches-cache.json', JSON.stringify(this.latestMatches, null, 2));
      } catch {}

    } catch (error) {
      console.error('❌ 抓取赛事失败:', error);
    }
  }

  /**
   * 获取更多盘口信息
   */
  private async enrichMatches(matches: any[]): Promise<void> {
    if (!this.apiClient) return;

    for (const match of matches) {
      try {
        const ecid = match.ecid;
        const lid = match.raw?.LID || match.raw?.lid;

        if (!ecid || !lid) continue;

        const moreXml = await this.apiClient.getGameMore({
          gid: String(ecid),
          lid: String(lid),
          gtype: 'ft',
          showtype: 'live',
          ltype: '3',
          isRB: 'Y',
        });

        if (moreXml) {
          const { handicapLines, overUnderLines } = this.parseMoreMarketsFromXml(moreXml);

          if (!match.markets.full) {
            match.markets.full = {};
          }

          if (handicapLines.length > 0) {
            match.markets.full.handicapLines = handicapLines;
            match.markets.handicap = handicapLines[0];
            match.markets.full.handicap = handicapLines[0];
          }

          if (overUnderLines.length > 0) {
            match.markets.full.overUnderLines = overUnderLines;
            match.markets.ou = overUnderLines[0];
            match.markets.full.ou = overUnderLines[0];
          }
        }

        // 延迟50ms
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        // 忽略单个比赛的错误
      }
    }
  }

  /**
   * 获取最新的赛事数据
   */
  getLatestMatches(): MatchData {
    return this.latestMatches;
  }

  /**
   * 解析赛事 XML
   */
  private parseMatchesFromXml(xml: string): any[] {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml);

      const ec = parsed?.serverresponse?.ec;
      if (!ec) {
        return [];
      }

      const ecArray = Array.isArray(ec) ? ec : [ec];
      const matches: any[] = [];

      for (const ecItem of ecArray) {
        const games = ecItem?.game;
        if (!games) continue;

        const gameArray = Array.isArray(games) ? games : [games];

        for (const game of gameArray) {
          const match = this.parseMatch(game, ecItem);
          if (match) {
            matches.push(match);
          }
        }
      }

      return matches;
    } catch (error) {
      console.error('❌ 解析赛事 XML 失败:', error);
      return [];
    }
  }

  /**
   * 解析单个比赛
   */
  private parseMatch(game: any, ec: any): any {
    // 这里复用 crown-automation.ts 中的解析逻辑
    // 为了简化，这里只实现基本解析
    const pick = (keys: string[]): string => {
      for (const key of keys) {
        if (game[key]) return String(game[key]).trim();
      }
      return '';
    };

    return {
      gid: pick(['GID', 'gid']),
      ecid: pick(['@_id', 'id']) || ec?.['@_id'],
      league: pick(['LEAGUE', 'league']),
      home: pick(['TEAM_H', 'team_h']),
      away: pick(['TEAM_C', 'team_c']),
      datetime: pick(['DATETIME', 'datetime']),
      score: {
        home: pick(['SCORE_H', 'score_h']),
        away: pick(['SCORE_C', 'score_c']),
      },
      markets: {
        full: {},
        half: {},
      },
      raw: game,
    };
  }

  /**
   * 解析更多盘口
   */
  private parseMoreMarketsFromXml(xml: string): { handicapLines: any[]; overUnderLines: any[] } {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml);

      const games = parsed?.serverresponse?.game;
      if (!games) {
        return { handicapLines: [], overUnderLines: [] };
      }

      const gameArray = Array.isArray(games) ? games : [games];
      const handicapLines: any[] = [];
      const overUnderLines: any[] = [];

      for (const game of gameArray) {
        // 提取让球盘口
        const handicapLine = this.pickString(game, ['RATIO_RE', 'ratio_re']);
        const handicapHome = this.pickString(game, ['IOR_REH', 'ior_REH']);
        const handicapAway = this.pickString(game, ['IOR_REC', 'ior_REC']);

        if (handicapLine && (handicapHome || handicapAway)) {
          handicapLines.push({
            line: handicapLine,
            home: handicapHome,
            away: handicapAway,
          });
        }

        // 提取大小球盘口
        const ouLineMain = this.pickString(game, ['ratio_rouo', 'RATIO_ROUO', 'ratio_rouu', 'RATIO_ROUU']);
        const ouOverMain = this.pickString(game, ['ior_ROUC', 'IOR_ROUC']);
        const ouUnderMain = this.pickString(game, ['ior_ROUH', 'IOR_ROUH']);

        if (ouLineMain && (ouOverMain || ouUnderMain)) {
          overUnderLines.push({
            line: ouLineMain,
            over: ouOverMain,
            under: ouUnderMain,
          });
        }
      }

      return { handicapLines, overUnderLines };
    } catch (error) {
      console.error('❌ 解析更多盘口失败:', error);
      return { handicapLines: [], overUnderLines: [] };
    }
  }

  /**
   * 辅助方法：从对象中提取字符串值
   */
  private pickString(obj: any, keys: string[]): string {
    if (!obj) return '';
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        return String(obj[key]).trim();
      }
    }
    return '';
  }
}

// 单例实例
let fetcherInstance: MatchFetcher | null = null;

/**
 * 获取抓取服务实例
 */
export function getMatchFetcher(): MatchFetcher | null {
  return fetcherInstance;
}

/**
 * 初始化抓取服务
 */
export async function initMatchFetcher(config: FetchConfig): Promise<void> {
  if (fetcherInstance) {
    await fetcherInstance.stop();
  }

  fetcherInstance = new MatchFetcher(config);
  await fetcherInstance.start();
}

/**
 * 停止抓取服务
 */
export async function stopMatchFetcher(): Promise<void> {
  if (fetcherInstance) {
    await fetcherInstance.stop();
    fetcherInstance = null;
  }
}

