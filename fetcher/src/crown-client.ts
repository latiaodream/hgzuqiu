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

      // 先获取最新版本号
      await this.updateVersion();

      // 获取 BlackBox
      const blackbox = await this.getBlackBox();

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
   */
  private generateBlackBox(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}${random}`;
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

        // 全场让球盘口
        const handicapLine = pickString(game, ['RATIO_RE', 'RATIO_R']);
        const handicapHome = pickString(game, ['IOR_REH', 'IOR_RH']);
        const handicapAway = pickString(game, ['IOR_REC', 'IOR_RC']);
        if (handicapLine && (handicapHome || handicapAway)) {
          markets.handicap = { line: handicapLine, home: handicapHome, away: handicapAway };
          markets.full.handicap = { line: handicapLine, home: handicapHome, away: handicapAway };
        }

        // 全场大小球盘口
        const ouLine = pickString(game, ['RATIO_ROUO', 'RATIO_OUO', 'RATIO_ROUU', 'RATIO_OUU']);
        const ouOver = pickString(game, ['IOR_ROUC', 'IOR_OUC']);
        const ouUnder = pickString(game, ['IOR_ROUH', 'IOR_OUH']);
        if (ouLine && (ouOver || ouUnder)) {
          markets.ou = { line: ouLine, over: ouOver, under: ouUnder };
          markets.full.ou = { line: ouLine, over: ouOver, under: ouUnder };
        }

        // 半场让球盘口
        const halfHandicapLine = pickString(game, ['RATIO_HRE']);
        const halfHandicapHome = pickString(game, ['IOR_HREH']);
        const halfHandicapAway = pickString(game, ['IOR_HREC']);
        if (halfHandicapLine && (halfHandicapHome || halfHandicapAway)) {
          markets.half.handicap = { line: halfHandicapLine, home: halfHandicapHome, away: halfHandicapAway };
        }

        // 半场大小球盘口
        const halfOuLine = pickString(game, ['RATIO_HROUO', 'RATIO_HROUU']);
        const halfOuOver = pickString(game, ['IOR_HROUC']);
        const halfOuUnder = pickString(game, ['IOR_HROUH']);
        if (halfOuLine && (halfOuOver || halfOuUnder)) {
          markets.half.ou = { line: halfOuLine, over: halfOuOver, under: halfOuUnder };
        }

        return {
          gid,
          ecid,
          league,
          home,
          away,
          score,
          time: pickString(game, ['DATETIME', 'TIME']),
          status: pickString(game, ['RUNNING', 'STATUS']),
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
   * 抓取赛事列表
   */
  async fetchMatches(): Promise<FetchResult> {
    try {
      if (!this.uid) {
        return { success: false, matches: [], timestamp: Date.now(), error: '未登录' };
      }

      const timestamp = Date.now().toString();

      const params = new URLSearchParams({
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        p: 'get_game_list',
        p3type: '',
        date: '',
        gtype: 'ft',
        showtype: 'live',
        rtype: 'rb',
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
}

