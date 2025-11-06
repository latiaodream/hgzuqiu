import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface LoginResult {
  success: boolean;
  uid?: string;
  error?: string;
}

interface FetchResult {
  success: boolean;
  matches: any[];
  timestamp: number;
  error?: string;
}

export class CrownClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private uid: string | null = null;
  private version: string = '2024102801';
  private client: AxiosInstance;
  private sessionFile: string;
  private loginTime: number = 0;
  private lastEnrichTime: number = 0; // 上次获取更多盘口的时间

  constructor(config: { baseUrl: string; username: string; password: string; dataDir: string }) {
    this.baseUrl = config.baseUrl;
    this.username = config.username;
    this.password = config.password;
    this.sessionFile = path.join(config.dataDir, 'session.json');

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    // 加载已保存的会话
    this.loadSession();
  }

  /**
   * 加载已保存的会话
   */
  private loadSession(): void {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8'));
        if (data.uid && data.loginTime && Date.now() - data.loginTime < 7200000) {
          this.uid = data.uid;
          this.loginTime = data.loginTime;
          console.log(`✅ 加载已保存的会话: UID=${this.uid}, 登录时间=${new Date(this.loginTime).toLocaleString()}`);
        } else {
          console.log('⚠️ 会话已过期，需要重新登录');
        }
      }
    } catch (error) {
      console.error('❌ 加载会话失败:', error);
    }
  }

  /**
   * 保存会话到文件
   */
  private saveSession(): void {
    try {
      const dir = path.dirname(this.sessionFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.sessionFile,
        JSON.stringify({
          uid: this.uid,
          loginTime: this.loginTime,
        })
      );
      console.log('✅ 会话已保存');
    } catch (error) {
      console.error('❌ 保存会话失败:', error);
    }
  }

  /**
   * 获取 BlackBox（从皇冠站点获取）
   */
  private async getBlackBox(): Promise<string> {
    try {
      const response = await this.client.get('/app/member/FT_browse/index.php?rtype=r&langx=zh-cn&mtype=3');
      const html = response.data;
      const match = html.match(/var\s+BETKEY\s*=\s*['"]([^'"]+)['"]/);
      if (match) {
        return match[1];
      }
    } catch (error) {
      console.error('⚠️ 获取 BlackBox 失败');
    }
    // 返回默认值
    return this.generateBlackBox();
  }

  /**
   * 解析 XML 响应
   */
  private parseXmlResponse(xml: string): any {
    const result: any = {};

    // 提取所有标签内容
    const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
    let match;
    while ((match = tagRegex.exec(xml)) !== null) {
      result[match[1].toLowerCase()] = match[2];
    }

    return result;
  }

  /**
   * 登录
   */
  async login(): Promise<LoginResult> {
    try {
      console.log(`🔐 开始登录: ${this.username}`);

      // 清除旧的会话数据
      this.uid = null;
      this.loginTime = 0;

      // 先获取最新版本号
      await this.updateVersion();

      // 获取 BlackBox（使用生成的假 BlackBox，因为没有会话无法获取真实的）
      const blackbox = this.generateBlackBox();
      console.log(`🔐 使用生成的 BlackBox: ${blackbox.substring(0, 20)}...`);

      // Base64 编码 UserAgent
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
      const encodedUA = Buffer.from(userAgent).toString('base64');

      const params = new URLSearchParams({
        p: 'chk_login',
        langx: 'zh-cn',
        ver: this.version,
        username: this.username,
        password: this.password,
        app: 'N',
        auto: 'CFHFID',
        blackbox,
        userAgent: encodedUA,
      });

      const response = await this.client.post(`/transform.php?ver=${this.version}`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const text = response.data;
      const data = this.parseXmlResponse(text);

      console.log('📥 登录响应:', {
        status: data.status,
        msg: data.msg,
        username: data.username,
        uid: data.uid,
      });

      // 检查登录失败
      if (data.msg && data.msg.includes('密码错误次数过多')) {
        return { success: false, error: '密码错误次数过多，请联系您的上线寻求协助。' };
      }
      if (data.msg && (data.msg.includes('账号或密码错误') || data.msg.includes('帐号或密码错误'))) {
        return { success: false, error: '账号或密码错误' };
      }
      if (data.msg && data.msg.includes('账号已被锁定')) {
        return { success: false, error: '账号已被锁定' };
      }

      // 提取 UID
      if (data.uid) {
        this.uid = data.uid;
        this.loginTime = Date.now();
        this.saveSession();
        console.log(`✅ 登录成功: UID=${this.uid}`);
        return { success: true, uid: this.uid || undefined };
      }

      console.log('❌ 无法从响应中提取 UID');
      return { success: false, error: data.msg || '无法提取 UID' };
    } catch (error: any) {
      console.error('❌ 登录失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新版本号
   */
  private async updateVersion(): Promise<void> {
    try {
      const response = await this.client.get('/');
      const versionMatch = response.data.match(/ver=(\d+)/);
      if (versionMatch) {
        this.version = versionMatch[1];
      }
    } catch (error) {
      console.error('⚠️ 获取版本号失败，使用默认版本');
    }
  }

  /**
   * 生成 BlackBox 设备指纹
   * 生成一个看起来像真实 BlackBox 的字符串
   * 真实的 BlackBox 格式大概是：0400xxxxx@xxxxx@xxxxx;xxxxx
   */
  private generateBlackBox(): string {
    const timestamp = Date.now();
    const random1 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random3 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random4 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const random5 = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // 生成一个类似真实 BlackBox 的字符串（长度约 200-300 字符）
    const fakeBlackBox = `0400${random1}${random2}@${random3}@${random4};${random5}${timestamp}`;

    return fakeBlackBox;
  }

  /**
   * 检查会话是否有效
   */
  async checkSession(): Promise<boolean> {
    if (!this.uid) return false;

    // 会话超过 2 小时，需要重新登录
    if (Date.now() - this.loginTime > 7200000) {
      console.log('⚠️ 会话已过期（超过2小时）');
      return false;
    }

    try {
      // 尝试获取赛事列表来验证会话
      const result = await this.fetchMatches();
      return result.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * 确保已登录
   */
  async ensureLoggedIn(): Promise<boolean> {
    if (await this.checkSession()) {
      return true;
    }

    console.log('🔄 需要重新登录...');
    const result = await this.login();
    return result.success;
  }

  /**
   * 解析赛事 XML（使用 fast-xml-parser）
   */
  private parseMatches(xml: string): any[] {
    try {
      const { XMLParser } = require('fast-xml-parser');
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml);

      const ec = parsed?.serverresponse?.ec;
      if (!ec) {
        return [];
      }

      // 辅助函数：从对象中提取值
      const pickValue = (source: any, candidateKeys: string[]): any => {
        if (!source) return undefined;
        for (const key of candidateKeys) {
          if (source[key] !== undefined) return source[key];
          const attrKey = `@_${key}`;
          if (source[attrKey] !== undefined) return source[attrKey];
          const lowerKey = key.toLowerCase();
          for (const currentKey of Object.keys(source)) {
            if (currentKey.toLowerCase() === lowerKey) {
              return source[currentKey];
            }
            if (currentKey.toLowerCase() === `@_${lowerKey}`) {
              return source[currentKey];
            }
          }
        }
        return undefined;
      };

      const pickString = (source: any, candidateKeys: string[], fallback = ''): string => {
        const value = pickValue(source, candidateKeys);
        if (value === undefined || value === null) return fallback;
        return String(value).trim();
      };

      // 提取所有 game 元素
      const ecArray = Array.isArray(ec) ? ec : [ec];
      const allGames: any[] = [];
      for (const ecItem of ecArray) {
        const games = ecItem?.game;
        if (!games) continue;
        if (Array.isArray(games)) {
          allGames.push(...games);
        } else {
          allGames.push(games);
        }
      }

      // 解析每场比赛
      const matches = allGames.map((game: any) => {
        const gid = pickString(game, ['GID']);
        const ecid = pickString(game, ['ECID']);
        const league = pickString(game, ['LEAGUE']);
        const home = pickString(game, ['TEAM_H', 'TEAM_H_E', 'TEAM_H_TW']);
        const away = pickString(game, ['TEAM_C', 'TEAM_C_E', 'TEAM_C_TW']);
        const scoreH = pickString(game, ['SCORE_H']);
        const scoreC = pickString(game, ['SCORE_C']);
        const score = (scoreH || scoreC) ? `${scoreH || '0'}-${scoreC || '0'}` : '';

        // 解析盘口数据
        const markets: any = {
          full: {},
          half: {},
        };

        // 独赢盘口（全场）
        const moneylineHome = pickString(game, ['IOR_RMH', 'IOR_MH']);
        const moneylineDraw = pickString(game, ['IOR_RMN', 'IOR_MN', 'IOR_RMD']);
        const moneylineAway = pickString(game, ['IOR_RMC', 'IOR_MC']);
        if (moneylineHome || moneylineDraw || moneylineAway) {
          markets.moneyline = { home: moneylineHome, draw: moneylineDraw, away: moneylineAway };
          markets.full.moneyline = { home: moneylineHome, draw: moneylineDraw, away: moneylineAway };
        }

        // 全场让球盘口（支持多个盘口）
        const handicapLines: Array<{ line: string; home: string; away: string }> = [];
        const handicapLine = pickString(game, ['RATIO_RE', 'RATIO_R']);
        const handicapHome = pickString(game, ['IOR_REH', 'IOR_RH']);
        const handicapAway = pickString(game, ['IOR_REC', 'IOR_RC']);
        if (handicapLine || handicapHome || handicapAway) {
          handicapLines.push({ line: handicapLine, home: handicapHome, away: handicapAway });
        }
        if (handicapLines.length > 0) {
          markets.handicap = { ...handicapLines[0] };
          markets.full.handicap = { ...handicapLines[0] };
          markets.full.handicapLines = handicapLines;
        }

        // 全场大小球盘口（支持多个盘口）
        const ouLines: Array<{ line: string; over: string; under: string }> = [];
        // 主大小球盘口
        const ouLineMain = pickString(game, ['RATIO_ROUO', 'RATIO_OUO', 'RATIO_ROUU', 'RATIO_OUU']);
        const ouOverMain = pickString(game, ['IOR_ROUC', 'IOR_OUC']);
        const ouUnderMain = pickString(game, ['IOR_ROUH', 'IOR_OUH']);
        if (ouLineMain || ouOverMain || ouUnderMain) {
          ouLines.push({ line: ouLineMain, over: ouOverMain, under: ouUnderMain });
        }
        // 额外大小球盘口 1
        const ouLineH = pickString(game, ['RATIO_ROUHO']);
        const ouOverH = pickString(game, ['IOR_ROUHO']);
        const ouUnderH = pickString(game, ['RATIO_ROUHU', 'IOR_ROUHU']);
        if (ouLineH || ouOverH || ouUnderH) {
          ouLines.push({ line: ouLineH, over: ouOverH, under: ouUnderH });
        }
        // 额外大小球盘口 2
        const ouLineC = pickString(game, ['RATIO_ROUCO']);
        const ouOverC = pickString(game, ['IOR_ROUCO']);
        const ouUnderC = pickString(game, ['RATIO_ROUCU', 'IOR_ROUCU']);
        if (ouLineC || ouOverC || ouUnderC) {
          ouLines.push({ line: ouLineC, over: ouOverC, under: ouUnderC });
        }
        if (ouLines.length > 0) {
          markets.ou = { ...ouLines[0] };
          markets.full.ou = { ...ouLines[0] };
          markets.full.overUnderLines = ouLines;
        }

        // 半场独赢
        const halfMoneylineHome = pickString(game, ['IOR_HRMH']);
        const halfMoneylineDraw = pickString(game, ['IOR_HRMN']);
        const halfMoneylineAway = pickString(game, ['IOR_HRMC']);
        if (halfMoneylineHome || halfMoneylineDraw || halfMoneylineAway) {
          markets.half.moneyline = { home: halfMoneylineHome, draw: halfMoneylineDraw, away: halfMoneylineAway };
        }

        // 半场让球盘口
        const halfHandicapLines: Array<{ line: string; home: string; away: string }> = [];
        const halfHandicapLine = pickString(game, ['RATIO_HRE']);
        const halfHandicapHome = pickString(game, ['IOR_HREH']);
        const halfHandicapAway = pickString(game, ['IOR_HREC']);
        if (halfHandicapLine || halfHandicapHome || halfHandicapAway) {
          halfHandicapLines.push({ line: halfHandicapLine, home: halfHandicapHome, away: halfHandicapAway });
        }
        if (halfHandicapLines.length > 0) {
          markets.half.handicap = { ...halfHandicapLines[0] };
          markets.half.handicapLines = halfHandicapLines;
        }

        // 半场大小球盘口
        const halfOuLines: Array<{ line: string; over: string; under: string }> = [];
        const halfOuLine = pickString(game, ['RATIO_HROUO', 'RATIO_HROUU']);
        const halfOuOver = pickString(game, ['IOR_HROUC']);
        const halfOuUnder = pickString(game, ['IOR_HROUH']);
        if (halfOuLine || halfOuOver || halfOuUnder) {
          halfOuLines.push({ line: halfOuLine, over: halfOuOver, under: halfOuUnder });
        }
        if (halfOuLines.length > 0) {
          markets.half.ou = { ...halfOuLines[0] };
          markets.half.overUnderLines = halfOuLines;
        }

        // 盘口计数
        const counts = {
          handicap: pickString(game, ['R_COUNT']),
          overUnder: pickString(game, ['OU_COUNT']),
          correctScore: pickString(game, ['PD_COUNT']),
          corners: pickString(game, ['CN_COUNT']),
        };
        markets.counts = counts;

        const datetime = pickString(game, ['DATETIME', 'TIME']);
        const running = pickString(game, ['RUNNING', 'STATUS']);

        // 转换时间格式：将 "11-07 01:00" 转换为 ISO 格式
        const convertToISO = (timeStr: string): string => {
          if (!timeStr) return '';
          try {
            // 格式: "11-07 01:00" 或 "11-07 01:00:00"
            const parts = timeStr.trim().split(/[\s-:]+/);
            if (parts.length >= 3) {
              const month = parts[0].padStart(2, '0');
              const day = parts[1].padStart(2, '0');
              const hour = parts[2]?.padStart(2, '0') || '00';
              const minute = parts[3]?.padStart(2, '0') || '00';
              const second = parts[4]?.padStart(2, '0') || '00';

              // 使用当前年份
              const year = new Date().getFullYear();

              // 构造 ISO 格式
              return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
            }
          } catch (e) {
            console.error('时间转换失败:', timeStr, e);
          }
          return timeStr;
        };

        const isoDatetime = convertToISO(datetime);

        return {
          gid,
          ecid,
          league,
          league_name: league,
          home,
          away,
          team_h: home,
          team_c: away,
          score,
          current_score: score,
          time: isoDatetime,
          datetime: isoDatetime,
          match_time: isoDatetime,
          timer: isoDatetime,
          status: running,
          state: running,
          period: running === '1' ? '滚球' : running === '0' ? '未开赛' : '',
          markets,
          raw: game,
        };
      });

      return matches;
    } catch (error) {
      console.error('❌ 解析赛事失败:', error);
      return [];
    }
  }

  /**
   * 抓取赛事列表（支持不同类型）
   * @param options 抓取选项
   * @param options.showtype 显示类型 (live=滚球, today=今日, early=早盘)
   * @param options.gtype 比赛类型 (ft=足球, bk=篮球等)
   * @param options.rtype 盘口类型 (rb=滚球, r=非滚球)
   */
  async fetchMatches(options?: {
    showtype?: string;
    gtype?: string;
    rtype?: string;
  }): Promise<FetchResult> {
    try {
      if (!this.uid) {
        return { success: false, matches: [], timestamp: Date.now(), error: '未登录' };
      }

      const showtype = options?.showtype || 'live';
      const gtype = options?.gtype || 'ft';
      const rtype = options?.rtype || (showtype === 'live' ? 'rb' : 'r');

      const timestamp = Date.now().toString();

      const params = new URLSearchParams({
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        p: 'get_game_list',
        p3type: '',
        date: '',
        gtype,
        showtype,
        rtype,
        ltype: '3',
        filter: '',
        cupFantasy: 'N',
        sorttype: 'L',
        specialClick: '',
        isFantasy: 'N',
        ts: timestamp,
      });

      const response = await this.client.post(`/transform.php?ver=${this.version}`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const xml = response.data;

      // 检查是否是 doubleLogin 错误
      if (xml.includes('doubleLogin')) {
        console.log('⚠️ 检测到重复登录，会话已失效');
        this.uid = null; // 清除 UID，下次会重新登录
        return { success: false, matches: [], timestamp: Date.now(), error: 'doubleLogin' };
      }

      // 解析赛事
      const matches = this.parseMatches(xml);

      // 为每场比赛添加 showtype 标记
      matches.forEach((match: any) => {
        match.showtype = showtype;
        match.source_showtype = showtype;
      });

      // 每 5 秒才获取一次更多盘口，避免请求过多
      const now = Date.now();
      if (now - this.lastEnrichTime > 5000 && showtype === 'live') {
        this.lastEnrichTime = now;
        // 只对滚球的前 5 场比赛获取更多盘口
        await this.enrichMatches(matches.slice(0, 5));
      }

      return {
        success: true,
        matches,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      console.error('❌ 抓取失败:', error.message);
      return { success: false, matches: [], timestamp: Date.now(), error: error.message };
    }
  }

  /**
   * 获取更多盘口信息
   */
  private async enrichMatches(matches: any[]): Promise<void> {
    for (const match of matches) {
      try {
        const ecid = match.ecid;
        const lid = match.raw?.LID || match.raw?.lid || match.raw?.['@_LID'];

        if (!ecid || !lid) continue;

        const moreXml = await this.getGameMore({
          gid: String(ecid),
          lid: String(lid),
          gtype: 'ft',
          showtype: 'live',
          ltype: '3',
          isRB: 'Y',
        });

        if (moreXml) {
          const { handicapLines, overUnderLines, halfHandicapLines, halfOverUnderLines } = this.parseMoreMarkets(moreXml);

          if (!match.markets.full) {
            match.markets.full = {};
          }
          if (!match.markets.half) {
            match.markets.half = {};
          }

          // 全场盘口
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

          // 半场盘口
          if (halfHandicapLines.length > 0) {
            match.markets.half.handicapLines = halfHandicapLines;
            match.markets.half.handicap = halfHandicapLines[0];
          }

          if (halfOverUnderLines.length > 0) {
            match.markets.half.overUnderLines = halfOverUnderLines;
            match.markets.half.ou = halfOverUnderLines[0];
          }
        }

        // 延迟50ms避免请求过快
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        // 忽略单个比赛的错误
      }
    }
  }

  /**
   * 获取比赛的所有玩法和盘口
   */
  private async getGameMore(params: {
    gid: string;
    lid: string;
    gtype: string;
    showtype: string;
    ltype: string;
    isRB: string;
  }): Promise<string | null> {
    try {
      if (!this.uid) return null;

      const timestamp = Date.now().toString();

      const requestParams = new URLSearchParams({
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        p: 'get_game_more',
        gtype: params.gtype,
        showtype: params.showtype,
        ltype: params.ltype,
        isRB: params.isRB,
        lid: params.lid,
        specialClick: '',
        mode: 'NORMAL',
        from: 'game_more',
        filter: 'Main',
        ts: timestamp,
        ecid: params.gid,
      });

      const response = await this.client.post(`/transform.php?ver=${this.version}`, requestParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * 解析 get_game_more 返回的多个盘口
   */
  private parseMoreMarkets(xml: string): {
    handicapLines: any[];
    overUnderLines: any[];
    halfHandicapLines: any[];
    halfOverUnderLines: any[];
  } {
    try {
      const { XMLParser } = require('fast-xml-parser');
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml);

      const games = parsed?.serverresponse?.game;
      if (!games) {
        return { handicapLines: [], overUnderLines: [], halfHandicapLines: [], halfOverUnderLines: [] };
      }

      const gameArray = Array.isArray(games) ? games : [games];

      const handicapLines: any[] = [];
      const overUnderLines: any[] = [];
      const halfHandicapLines: any[] = [];
      const halfOverUnderLines: any[] = [];

      const pickString = (source: any, candidateKeys: string[], fallback = ''): string => {
        if (!source) return fallback;
        for (const key of candidateKeys) {
          if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
            return String(source[key]).trim();
          }
          const attrKey = `@_${key}`;
          if (source[attrKey] !== undefined && source[attrKey] !== null && source[attrKey] !== '') {
            return String(source[attrKey]).trim();
          }
        }
        return fallback;
      };

      for (const game of gameArray) {
        // 全场让球
        const handicapLine = pickString(game, ['RATIO_RE', 'ratio_re']);
        const handicapHome = pickString(game, ['IOR_REH', 'ior_REH']);
        const handicapAway = pickString(game, ['IOR_REC', 'ior_REC']);
        if (handicapLine && (handicapHome || handicapAway)) {
          handicapLines.push({ line: handicapLine, home: handicapHome, away: handicapAway });
        }

        // 全场大小球
        const ouLine = pickString(game, ['RATIO_ROUO', 'ratio_rouo', 'RATIO_ROUU', 'ratio_rouu']);
        const ouOver = pickString(game, ['IOR_ROUC', 'ior_ROUC']);
        const ouUnder = pickString(game, ['IOR_ROUH', 'ior_ROUH']);
        if (ouLine && (ouOver || ouUnder)) {
          overUnderLines.push({ line: ouLine, over: ouOver, under: ouUnder });
        }

        // 半场让球
        const halfHandicapLine = pickString(game, ['RATIO_HRE', 'ratio_hre']);
        const halfHandicapHome = pickString(game, ['IOR_HREH', 'ior_HREH']);
        const halfHandicapAway = pickString(game, ['IOR_HREC', 'ior_HREC']);
        if (halfHandicapLine && (halfHandicapHome || halfHandicapAway)) {
          halfHandicapLines.push({ line: halfHandicapLine, home: halfHandicapHome, away: halfHandicapAway });
        }

        // 半场大小球
        const halfOuLine = pickString(game, ['RATIO_HROUO', 'ratio_hrouo', 'RATIO_HROUU', 'ratio_hrouu']);
        const halfOuOver = pickString(game, ['IOR_HROUC', 'ior_HROUC']);
        const halfOuUnder = pickString(game, ['IOR_HROUH', 'ior_HROUH']);
        if (halfOuLine && (halfOuOver || halfOuUnder)) {
          halfOverUnderLines.push({ line: halfOuLine, over: halfOuOver, under: halfOuUnder });
        }
      }

      return { handicapLines, overUnderLines, halfHandicapLines, halfOverUnderLines };
    } catch (error) {
      console.error('❌ 解析更多盘口失败:', error);
      return { handicapLines: [], overUnderLines: [], halfHandicapLines: [], halfOverUnderLines: [] };
    }
  }
}

