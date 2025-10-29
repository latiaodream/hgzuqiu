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
   * 登录
   */
  async login(): Promise<LoginResult> {
    try {
      console.log(`🔐 开始登录: ${this.username}`);

      // 先获取最新版本号
      await this.updateVersion();

      const params = new URLSearchParams({
        p: 'login',
        ver: this.version,
        langx: 'zh-cn',
        username: this.username,
        passwd: this.password,
        blackbox: this.generateBlackBox(),
      });

      const response = await this.client.post('/transform.php', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const text = response.data;

      // 打印返回内容（调试用）
      console.log('📥 登录响应（前500字符）:', text.substring(0, 500));

      // 检查登录失败
      if (text.includes('密码错误次数过多')) {
        return { success: false, error: '密码错误次数过多，请联系您的上线寻求协助。' };
      }
      if (text.includes('账号或密码错误')) {
        return { success: false, error: '账号或密码错误' };
      }
      if (text.includes('账号已被锁定')) {
        return { success: false, error: '账号已被锁定' };
      }
      if (text.includes('帐号或密码错误')) {
        return { success: false, error: '账号或密码错误' };
      }

      // 提取 UID
      const uidMatch = text.match(/uid[=:]([a-z0-9]+)/i);
      if (uidMatch) {
        this.uid = uidMatch[1];
        this.loginTime = Date.now();
        this.saveSession();
        console.log(`✅ 登录成功: UID=${this.uid}`);
        return { success: true, uid: this.uid };
      }

      console.log('❌ 无法从响应中提取 UID');
      return { success: false, error: '无法提取 UID' };
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
   * 抓取赛事列表
   */
  async fetchMatches(): Promise<FetchResult> {
    try {
      if (!this.uid) {
        return { success: false, matches: [], timestamp: Date.now(), error: '未登录' };
      }

      const params = new URLSearchParams({
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        p: 'get_game_list',
        gtype: 'ft',
        showtype: 'live',
        rtype: 'rb',
        ltype: '3',
        sorttype: 'L',
        ts: Date.now().toString(),
      });

      const response = await this.client.post('/transform.php', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const xml = response.data;

      // 简单解析 XML（提取比赛数量）
      const gameMatches = xml.match(/<game[^>]*>/gi);
      const matchCount = gameMatches ? gameMatches.length : 0;

      return {
        success: true,
        matches: [], // 这里可以解析详细数据，暂时只返回数量
        timestamp: Date.now(),
      };
    } catch (error: any) {
      console.error('❌ 抓取失败:', error.message);
      return { success: false, matches: [], timestamp: Date.now(), error: error.message };
    }
  }
}

